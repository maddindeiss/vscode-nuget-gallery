# NuGet Gallery Extension

✅ Enhance your Visual Studio Code experience with the NuGet Gallery extension. Streamlining the process of managing NuGet packages, it makes installation, updating, and uninstallation efficient and user-friendly.

<p align="center" width="100%">
    <img width="1200" src="docs/images/run_extension.gif">
</p>

## Features

### 📦 Simplified Package Management

Effortlessly install, update, and uninstall NuGet packages for your projects directly within Visual Studio Code.

<p align="center" width="100%">
    <img width="1200" src="docs/images/feature_1.gif"> 
</p>

### 🎯 Central Package Management Support

Full support for [Central Package Management (CPM)](https://learn.microsoft.com/en-us/nuget/consume-packages/central-package-management) using `Directory.Packages.props`. The extension automatically:
- Reads package versions from `Directory.Packages.props` when packages don't have versions in project files
- Detects when CPM is enabled via the `ManagePackageVersionsCentrally` property
- Works seamlessly with both CPM and traditional package management approaches

> **Note:** CPM package updates require [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) or higher due to the `dotnet package update` command. The CPM feature itself (reading versions) works with .NET 6.0+ SDKs.

### 🚀 Source Management

Manage your NuGet package sources effortlessly. Add, remove, or modify package sources to suit your project requirements.

> Utilize private feeds seamlessly with the required credential provider. Find installation instructions and more details [here](https://github.com/microsoft/artifacts-credprovider).

<p align="center" width="100%">
    <img width="1200" src="docs/images/feature_2.gif"> 
</p>
