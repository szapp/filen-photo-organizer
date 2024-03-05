# Filen Photo Organizer

[![build](https://github.com/szapp/filen-photo-organizer/actions/workflows/build.yml/badge.svg)](https://github.com/szapp/filen-photo-organizer/actions/workflows/build.yml)
[![marketplace](https://img.shields.io/github/v/release/szapp/filen-photo-organizer?logo=githubactions&logoColor=white&label=marketplace)](https://github.com/marketplace/actions/filen-photo-organizer)

Automatically organize photo and camera uploads on your [Filen.io](https://filen.io) drive.

## Availability

Available for NodeJS and as GitHub Action for immediate usability via scheduled workflows (cron job).

[![Use me](https://img.shields.io/badge/template-use%20me-green?style=for-the-badge&logo=github)](https://repo.new/?template_name=filen-photo-organizer-template&template_owner=szapp&name=filen-photo-organizer&description=Automatically%20organizes%20my%20filen.io%20photos)

Click the link above to set up the photo organizer for your own filen.io drive with minimal effort.

## Features

- Automatic organization of photo files
- Photos can be sorted into directories based on date taken (default 'yyyy-MM')
- Photos can be renamed based on date taken (default 'yyyy-MM-dd_HH.mm.ss')
- HEIC/HEIF photos are converted to JPEG while retaining the EXIF metadata
- File name collision is prevented by incremental suffixes (i.e. 'filename_002.jpg')
- Identical files are deleted in case they are uploaded again - based on date taken and content
- Use immediately with GitHub Action scheduled workflows to running continuously in the background

## Run as scheduled GitHub Action

To make the organization useful, periodic maintenance is essential, e.g. via a periodically executed cron job.
While other hosted services limit the frequency of cron jobs in their free plans, GitHub Actions offer generous quota on scheduling.
This repository contains a GitHub Action that can be used without any coding knowledge, as all configuration is outsourced into GitHub variables and secrets.

The setup is explained in an easy to clone template repository: https://github.com/szapp/filen-photo-organizer-template or click the button above

## Example script

For manual usage, here is a minimal example

```yml
name: Organize photos
# For an easy to use template visit https://github.com/szapp/filen-photo-organizer-template

# Run very ten minutes between 5:00 and 22:00 UTC or by manual dispatch
on:
  workflow_dispatch:
  schedule:
    - cron: '*/10 5-22 * * *'

# The configuration is completely outsourced into GitHub Action variables and secrets
# This allows to update the settings without altering the scripts or pushing changes to the repository
# Never expose any sensitive information directly, and always use GitHub secrets where necessary
jobs:
  organize:
    name: Organize photos
    runs-on: ubuntu-latest
    steps:
      - uses: szapp/filen-photo-organizer@v2
        with:
          email: ${{ secrets.FILEN_EMAIL }}
          password: ${{ secrets.FILEN_PASSWORD }}
          twoFactorCode: ${{ secrets.FILEN_TFA }}
          rootPath: ${{ vars.ROOT_PATH }}
          dirPattern: ${{ vars.DIR_PATTERN }}
          filePattern: ${{ vars.FILE_PATTERN }}
          timeZone: ${{ vars.TIME_ZONE }}
          dryRun: false
```

## Environment variables

To allow usage without any programming experience, the configuration is outsourced into the GitHub variables and secrets. This has the advantages that no files have to be edited and that the configuration can be maintained from the repository settings. Below are the variables and secrets that have to be set.

> ⚠️ **Warning:** The contents of the secrets are very sensitive. Make sure to not publish them to GitHub or share them with anyone. It's best to only enter them into the designated secrets-setting. If exposed, these values allow arbitrary access to your Filen Drive.  
> If the Filen SDK offers granular API Tokens for more secure access, this repository will be updated accordingly.

| Secret         | Default               | Description                                                                                                   |
| -------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| FILEN_EMAIL    | _required_            | Filen account email                                                                                           |
| FILEN_PASSWORD | _required_            | Filen account password                                                                                        |
| FILEN_TFA      |                       | Filen account two-factor authentication secret, not the generated OTP (if enabled)                            |
|                |                       |
| **Variable**   | **Default**           | **Description**                                                                                               |
|                |                       |                                                                                                               |
| ROOT_PATH      |                       | Path to the photo directory                                                                                   |
| DIR_PATTERN    | `yyyy-MM`             | Date pattern to sort the photos into (if '', no directories will be created) [Format][date-format-link]       |
| FILE_PATTERN   | `yyyy-MM-dd_HH.mm.ss` | Date pattern for renaming the files based on date-taken (if '', files will not be renamed)                    |
| TIME_ZONE      | `Europe/Berlin`       | Time zone to assume for photo organization, i.e. where the photos were taken [TZ identifiers][timezones-link] |

[date-format-link]: https://moment.github.io/luxon/#/formatting?id=table-of-tokens
[timezones-link]: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

Secrets can be set in the repository settings in the section `Security` in `Secrets and variables` -> `Actions` in the `Secrets` tab under `Repository secrets`. The variables are set in the `Variables` tab under `Repository variables`. Be mindful about the difference between variables and secrets and note the list above.

## Run manually in NodeJS

Install locally

```bash
npm install github:szapp/filen-photo-organizer
```

Import

```typescript
// JavaScript
const organizePhotos = require('filen-photo-organizer')
// TypeScript
import organizePhotos from 'filen-photo-organizer'

const main = async () => {
  await organizePhotos(
    {
      email: 'filen-user@example.com',
      password: 'filen-password',
      twoFactorCode: '123456', // Blank if not enabled
    },
    '/path/to/photos/',
    'yyyy-MM', // Directory pattern
    'yyyy-MM-dd_HH.mm.ss' // File name pattern
  )
}

main()
```

## See Also

- [filen.io](https://filen.io)
- [filen-sdk-ts](https://github.com/FilenCloudDienste/filen-sdk-ts)
