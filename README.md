# Filen Photo Organizer

[![build](https://github.com/szapp/filen-photo-organizer/actions/workflows/build.yml/badge.svg)](https://github.com/szapp/filen-photo-organizer/actions/workflows/build.yml)
[![marketplace](https://img.shields.io/github/v/release/szapp/filen-photo-organizer?logo=githubactions&logoColor=white&label=marketplace)](https://github.com/marketplace/actions/filen-photo-organizer)

Automatically organize photo and camera uploads on your [Filen.io](https://filen.io) drive.

## Availability

Available for NodeJS and as GitHub Action for immediate usability via scheduled workflows (cron job).

[![Use me](https://img.shields.io/badge/template-use%20me-green?style=for-the-badge&logo=github)](https://repo.new/?template_name=filen-photo-organizer-template&template_owner=szapp&name=filen-photo-organizer&description=Automatically%20organizes%20my%20filen.io%20photos)

Click the link above to set up the photo organizer for your own Filen drive with minimal effort.  
After clicking, follow the instructions in the README of the created repository.

## Features

- Automatic organization of photo files
- Photos can be sorted into directories based on date taken (default folder name 'yyyy-MM')
- Photos can be renamed based on date taken (default file name 'yyyy-MM-dd_HH.mm.ss')
- Date and time operations consider the time zone the photo was taken in (based on GPS metadata if available)
- HEIC/HEIF photos are converted to JPEG while retaining the EXIF metadata
- File name collision is prevented by incremental suffixes (i.e. 'filename_002.jpg')
- Identical files are deleted in case they are uploaded again - based on date taken and content
- Use immediately with GitHub Action scheduled workflows to running continuously in the background

## Run as scheduled GitHub Action

To make the organization useful, periodic maintenance is essential, e.g. via a periodically executed cron job.
While other hosted services limit the frequency of cron jobs in their free plans, GitHub Actions offer generous quota on scheduling.
This repository contains a GitHub Action that can be used without any coding knowledge, as all configuration is outsourced into GitHub variables and secrets.

The setup is explained in an easy to clone template repository at https://github.com/szapp/filen-photo-organizer-template. Click the link or the button above and follow the instructions there.

### V3

Differentiate between two factor code and two factor secret.
Moving from V2 to V3 requires updating the action inputs `twoFactorCode` and `twoFactorSecret` (if used).

### V2

Time zone information is now included when organizing the photos by date-taken.
Before, time stamps in file and directory names were produced in the local time zone of the GitHub action.
This produced incorrect file names, as GitHub Actions likely operate with a different system time zone than the user.
Now, GPS metadata of the photos are read to determine the time zone they have been photographed in to infer correct time stamps.
When no GPS information is available, the time stamp curation defaults to a customizable fallback time zone, i.e. the users default.
The fallback time zone is specified with [TZ/IANA identifiers][timezones-link].
If not provided, the fallback time zone defaults to Filen's base of operations: 'Europe/Berlin'.

Breaking changes from V1 to V2 are the order of function parameters (with the new parameter `fallbackTimeZone`) and the date-time formatting for directory and file name patterns.
The formatting changed from `date-and-time` to using `luxon`, with different [date formatting][date-format-link].
Moving from V1 to V2 requires updating the action inputs `dirPattern` and `filePattern` (if used) and adding a `fallbackTimeZone` if desired and different from the default.

### Example script

For manual usage of the GitHub Action in a workflow, here is a minimal example with explanations

```yml
- uses: szapp/filen-photo-organizer@v3
  with:
    # User login email of filen.io account
    # Required
    email: ''

    # User login passwort of filen.io account
    # Required
    password: ''

    # Two factor code, i.e. generated OTP (if enabled).
    # If 2FA is enabled, either twoFactorSecret or twoFactorCode must be provided. If both are provided, twoFactorCode takes precedence.
    # Optional
    twoFactorCode: ''

    # Two factor secret (if enabled).
    # If 2FA is enabled, either twoFactorSecret or twoFactorCode must be provided. If both are provided, twoFactorCode takes precedence.
    # Optional
    twoFactorSecret: ''

    # Path to the photo directory
    # Required
    rootPath: ''

    # Date-time pattern of directories to sort the photos into (if '', no directories will be created)
    # The pattern is based on the date taken
    # Format: https://moment.github.io/luxon/docs/manual/formatting.html#table-of-tokens
    #
    # Default: 'yyyy-MM'
    dirPattern: 'yyyy-MM'

    # Date-time pattern for renaming the files based on date taken (if '', preserve original file name)
    # The pattern is based on the date taken.
    # Format: https://moment.github.io/luxon/docs/manual/formatting.html#table-of-tokens
    #
    # Default: 'yyyy-MM-dd_HH.mm.ss'
    filePattern: 'yyyy-MM-dd_HH.mm.ss'

    # Time zone to assume for photo organization when no time zone offset and GPS metadata is available, i.e. the time zone in which the photos were taken.
    # As TZ / IANA identifier (e.g. 'Europe/Berlin')
    # Identifiers: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
    #
    # Default: 'Europe/Berlin'
    fallbackTimeZone: 'Europe/Berlin'

    # Do not perform write operations on the filen.io
    #
    # Default: false
    dryRun: false
```

Find a full workflow example [here](https://github.com/szapp/filen-photo-organizer/blob/main/.github/workflows/organize.yml).
For easy usage, refer to the template repository: [szapp/filen-photo-organizer-template](https://github.com/szapp/filen-photo-organizer-template)

> ⚠️ **Warning:** The login information (`email`, `password`, `twoFactorCode`, and `twoFactorSecret`) are sensitive information.
> Make sure to never publish them to GitHub or share them with anyone.
> Specify them using GitHub secrets only.
> If exposed, these values allow arbitrary access to your Filen drive.  
> If the Filen SDK implements granular API Tokens for more secure access in the future, this repository will be updated accordingly.

Secrets can be set in the repository settings in the section `Security` in `Secrets and variables` -> `Actions` in the `Secrets` tab under `Repository secrets`.

## Run manually in NodeJS

Install

```
npm install szapp/filen-photo-organizer
```

Import

```typescript
// JavaScript
const organizePhotos = require('filen-photo-organizer')
// TypeScript
import organizePhotos from 'filen-photo-organizer'
```

Use

```typescript
await organizePhotos(
  {
    email: 'filen-user@example.com',
    password: 'filen-password',
    twoFactorCode: '123456', // Omit if not enabled
    twoFactorSecret: 'JFSU4NNSFGFLOPL2', // Omit if not enabled or providing 'twoFactorCode'
  },
  '/path/to/photos/',
  'yyyy-MM', // Directory pattern
  'yyyy-MM-dd_HH.mm.ss', // File name pattern
  'Europe/Berlin' // Fallback time zone as IANA time zone identifier
)
```

### Offline use

This package can also be used offline using `node:fs` on the local file system without cloud operations.
Use to the git branch `fs-offline`.
Mind the different function signature of `organizePhotos` in the source code.

```
npm install szapp/filen-photo-organizer#fs-offline
```

## Finaly notes

- For videos only the file modification time and file name are considered for time-based operations.
  Reading the metadata of a file requires to load the entire file into memory, due to the encryption.
  While that has reasonably overhead for images, this step is omitted for videos in favor of their file size and the respective traffic and memory usage that would produce.
  Nevertheless, in the scope of camera uploads, the modification time of a file usually coincides with the capture time.

## See Also

- [filen.io](https://filen.io)
- [filen-sdk-ts](https://github.com/FilenCloudDienste/filen-sdk-ts)

[date-format-link]: https://moment.github.io/luxon/#/formatting?id=table-of-tokens
[timezones-link]: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
