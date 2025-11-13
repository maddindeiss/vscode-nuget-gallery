# Change Log

All notable changes to the "vscode-nuget-gallery" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Support for Central Package Management (CPM) using Directory.Packages.props
  - Extension now reads package versions from Directory.Packages.props when packages don't have versions specified in project files
  - Automatically detects when CPM is enabled via ManagePackageVersionsCentrally property
  - Compatible with both CPM and non-CPM projects

## [1.2.4]

### Fix

- Fix `Installed` tab error for Windows

## [1.2.3]

### Fix

- Respect proxy settings when making requests to repository endpoints
- Changed error handling to correctly log AxiosErrors
- Missing package versions

### Added

- Package info and dependencies
- Option to skip restore when adding package

## [1.1.0]

### Added

- Package info and dependencies

## [1.0.0]

- Initial release
