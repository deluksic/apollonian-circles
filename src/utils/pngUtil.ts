import { decompressJsonQuery } from './jsonQueryParam'

let crcTable: Uint32Array = new Uint32Array(256)
let crcTableComputed = false
function generateCrcTable(table: Uint32Array) {
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  crcTableComputed = true
}
function convertCrcToUint32(num: number): number {
  if (num >= 0) {
    return num
  }
  const tmp = new Uint32Array(1)
  tmp[0] = num
  return tmp[0]
}
export function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    if (!crcTableComputed) {
      generateCrcTable(crcTable)
    }
    const tableIndex = (crc ^ byte) & 0xff
    const tableLookup = crcTable?.[tableIndex]
    if (tableLookup === undefined) {
      throw new Error('CRC lookup table index out of range')
    }
    crc = tableLookup ^ (crc >>> 8)
  }
  return convertCrcToUint32(crc ^ 0xffffffff)
}

const PNG_HEADER_SIZE_IN_BYTES = 8
const CHUNK_KEY_STRING = 'FlameJson'
const CHUNK_TYPE_SIZE_IN_BYTES = 4
const CHUNK_LENGTH_SIZE_IN_BYTES = 4
const CHUNK_CRC_SIZE_IN_BYTES = 4
const CHUNK_KEY_SIZE_IN_BYTES = CHUNK_KEY_STRING.length
const CHUNK_KEY_END_SIZE_IN_BYTES = 1
const CHUNK_COMPRESSION_SIZE_IN_BYTES = 1
const CHUNK_COMPRESSION_DEFLATE = 0x00
const ztxtTypeBytes = new Uint8Array([0x7a, 0x54, 0x58, 0x74]) // zTXt type signature
// convert key to ASCII and add null separator
const keywordBytes = new TextEncoder().encode(CHUNK_KEY_STRING + '\0')
// compression method (0 for deflate)
const compressionMethod = new Uint8Array([CHUNK_COMPRESSION_DEFLATE])
function insertZtxtChunk(
  imageData: Uint8Array,
  encodedDataBytes: Uint8Array,
): Uint8Array {
  // construct zTXt chunk data: [keywordBytes] + [compressionMethod] + [encodedData]
  const ztxtChunkData = new Uint8Array([
    ...keywordBytes,
    ...compressionMethod,
    ...encodedDataBytes,
  ])

  // calculate CRC32
  const chunkCRC = crc32(new Uint8Array([...ztxtTypeBytes, ...ztxtChunkData]))

  // create zTXt chunk: [Length] + [Type] + [Data] + [CRC]
  const chunkLength = new Uint8Array(
    new Uint32Array([ztxtChunkData.length]).buffer,
  ).reverse()
  const chunkCRCBytes = new Uint8Array(
    new Uint32Array([chunkCRC]).buffer,
  ).reverse()
  const zTXtChunk = new Uint8Array([
    ...chunkLength,
    ...ztxtTypeBytes,
    ...ztxtChunkData,
    ...chunkCRCBytes,
  ])
  // find insertion point before IDAT
  let imagePos = PNG_HEADER_SIZE_IN_BYTES
  while (imagePos < imageData.length) {
    const length = new DataView(imageData.buffer).getUint32(imagePos, false)
    const chunkType = String.fromCharCode(
      ...imageData.slice(
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES,
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES + CHUNK_TYPE_SIZE_IN_BYTES,
      ),
    )
    if (chunkType === 'IDAT') {
      break
    }
    imagePos +=
      CHUNK_TYPE_SIZE_IN_BYTES +
      CHUNK_LENGTH_SIZE_IN_BYTES +
      length +
      CHUNK_CRC_SIZE_IN_BYTES
  }

  // construct new PNG with inserted chunk
  const newPngBytes = new Uint8Array([
    ...imageData.slice(0, imagePos),
    ...zTXtChunk,
    ...imageData.slice(imagePos),
  ])

  return newPngBytes
}
export async function extractFlameFromPng(imageData: Uint8Array) {
  let imagePos = 8
  let flameData = undefined
  while (imagePos < imageData.length) {
    const length = new DataView(imageData.buffer).getUint32(imagePos, false)
    const chunkType = String.fromCharCode(
      ...imageData.slice(
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES,
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES + CHUNK_TYPE_SIZE_IN_BYTES,
      ),
    )
    if (chunkType === 'zTXt') {
      const chunkTypePos = imagePos + CHUNK_LENGTH_SIZE_IN_BYTES
      const chunkData = imageData.subarray(
        chunkTypePos,
        chunkTypePos + CHUNK_TYPE_SIZE_IN_BYTES + length,
      )
      const chunkDataPos = chunkTypePos + CHUNK_TYPE_SIZE_IN_BYTES
      // index of \0, keyword should not have 0 value
      const separatorByteIdx = chunkData.indexOf(0)
      const crcIdx = chunkDataPos + length
      const crcData = imageData.slice(crcIdx, crcIdx + CHUNK_CRC_SIZE_IN_BYTES)
      const readCrc = new DataView(crcData.buffer).getUint32(0, false)
      // crc is calculated on all chunk segments except for length (first one)
      const calculatedCrc = crc32(new Uint8Array([...chunkData]))
      if (readCrc !== calculatedCrc) {
        console.warn(
          'CRC mismatch: PNG: ',
          readCrc,
          ', calculated: ',
          calculatedCrc,
        )
      } else {
        if (
          separatorByteIdx !== -1 &&
          chunkData[separatorByteIdx + 1] === CHUNK_COMPRESSION_DEFLATE
        ) {
          const compressedData = chunkData.slice(
            CHUNK_TYPE_SIZE_IN_BYTES +
              CHUNK_KEY_SIZE_IN_BYTES +
              CHUNK_KEY_END_SIZE_IN_BYTES +
              CHUNK_COMPRESSION_SIZE_IN_BYTES,
          )
          flameData = await decompressJsonQuery(compressedData)
          break
        } else {
          console.warn(
            'Compression type is invalid. Please use type: ',
            CHUNK_COMPRESSION_DEFLATE,
          )
          break
        }
      }
    }
    imagePos +=
      CHUNK_LENGTH_SIZE_IN_BYTES +
      CHUNK_TYPE_SIZE_IN_BYTES +
      length +
      CHUNK_CRC_SIZE_IN_BYTES
  }
  return flameData
}

export function addFlameDataToPng(
  flameData: Uint8Array,
  imageData: Uint8Array,
): Blob {
  const newImageData = insertZtxtChunk(imageData, flameData)
  return new Blob([newImageData], { type: 'image/png' })
}
