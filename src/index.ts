import { Mutex } from 'async-mutex'
import FilenSDK from '@filen/sdk'
import { DateTime, Settings } from 'luxon'
import * as OTPAuth from 'otpauth'
import { posix } from 'path'
import processFile from './process.js'

export default async function organizePhotos(
  credentials: { email: string; password: string; twoFactorCode: string | undefined },
  rootPath: string,
  dirPattern: string = 'yyyy-MM',
  filePattern: string = 'yyyy-MM-dd_HH.mm.ss',
  fallbackTimeZone: string = 'Europe/Berlin', // Filen.io location
  dryRun: boolean = false
): Promise<void> {
  const filen: FilenSDK = new FilenSDK({
    metadataCache: true,
  })

  // Update time zone
  Settings.defaultZone = fallbackTimeZone
  if (DateTime.local().zoneName === null) throw new Error('Error: Invalid time zone. Please specify a valid IANA zone')

  try {
    await filen.login({
      email: credentials.email,
      password: credentials.password,
      twoFactorCode: credentials.twoFactorCode ? new OTPAuth.TOTP({ secret: credentials.twoFactorCode }).generate() : undefined,
    })

    // Read directory
    let dirContents: string[] = await filen.fs().readdir({
      path: rootPath,
    })

    // Exclude directories by inspecting file extensions
    dirContents = dirContents.filter((name) => name.indexOf('.') !== -1).sort()

    // Individually process each file asynchronously
    // Nevertheless, create a mutex for writing operations to avoid file name collisions
    const writeAccess: Mutex = new Mutex(new Error('Something went wrong with the mutex!'))
    console.log(`Process ${dirContents.length} files in '${rootPath}'`)
    await Promise.allSettled(
      dirContents.map((fileName: string) =>
        processFile(filen, posix.join(rootPath, fileName), dirPattern, filePattern, writeAccess, dryRun)
      )
    )
  } finally {
    filen.logout()
    filen.clearTemporaryDirectory()
  }

  console.log('Done')
}

module.exports = organizePhotos
