import * as core from '@actions/core'
import organizePhotos from '../../'

async function run(): Promise<void> {
  const credentials: {
    email: string
    password: string
    twoFactorCode: string
  } = {
    email: core.getInput('email', { required: true }),
    password: core.getInput('password', { required: true, trimWhitespace: false }),
    twoFactorCode: core.getInput('twoFactorCode'),
  }
  const rootPath: string = core.getInput('rootPath', { required: true })
  const dirPattern: string = core.getInput('dirPattern')
  const filePattern: string = core.getInput('filePattern')
  const fallbackTimeZone: string = core.getInput('fallbackTimeZone')
  const dryRun: boolean = core.getBooleanInput('dryRun')

  let result: { numFiles: number; numErrors: number; errors: string[] }
  try {
    result = await organizePhotos(credentials, rootPath, dirPattern, filePattern, fallbackTimeZone, dryRun)
  } catch (error) {
    if (!(error instanceof Error)) error = new Error(String(error))
    const message: string = (error as Error).message
    core.setFailed(message)
    core.summary.addRaw(`Organize photos failed: ${message}`, true)
    core.summary.write({ overwrite: false })
    return
  }
  const { numFiles, numErrors, errors } = result

  // Report errors
  errors.map((msg) => core.error(msg))
  if (numErrors) core.setFailed(`Failed to process ${numErrors} file${numErrors !== 1 ? 's' : ''}`)

  // Create job summary
  if (!core.summary.isEmptyBuffer()) {
    core.summary.addSeparator()
    core.summary.addHeading('Organize photos', '1')
  }
  core.summary.addRaw(`Processed ${numFiles} files with ${numErrors} error${numErrors !== 1 ? 's' : ''}`, true)
  core.summary.addList(errors, false)
  core.summary.write({ overwrite: false })
}

run()
