declare module 'heic-jpg-exif' {
  async function context(
    inputFile: string | Buffer,
    outputPath?: string | undefined,
    quality: number | undefined = 1
  ): Promise<Buffer | void>
  export = context
}
