# How to contribute

If you want to contribute or run a local version of the Formo React Native Analytics SDK, follow these steps:

## Build the SDK Locally

Run the following command to build the SDK:

```bash
pnpm install
pnpm build
pnpm test
```

## Testing Locally

### Link the Local Package

To test your SDK changes in a test app, you can link the package locally using `pnpm link`.

For example, if your projects are in the same directory:

```
~/
├── your-react-native-app/
└── sdk-react-native/
```

Run the following commands:

```bash
# In ~/your-react-native-app
pnpm link ../sdk-react-native
```

### Apply Changes

Any changes you make to your local package require rebuilding to be reflected:

```bash
# In ~/sdk-react-native
pnpm build
```

The changes will automatically be available in the linked project.

### Unlink the Package

To remove the link:

```bash
# In ~/your-react-native-app
pnpm unlink ../sdk-react-native
```

## Running Tests

Run the test suite:

```bash
pnpm test
```

Run tests with coverage:

```bash
pnpm test:coverage
```

## Linting

Check code style:

```bash
pnpm lint
```

## Type Checking

Run TypeScript type checking:

```bash
pnpm typecheck
```

## Publishing

1. **Preview release notes**:
   ```bash
   pnpm preview-release
   ```
   This shows what the release notes will look like based on commits since the last tag.

2. **Update the version** using npm:
   ```bash
   npm version patch  # For bug fixes
   npm version minor  # For new features
   npm version major  # For breaking changes
   ```

   This automatically:
   - Updates `package.json` with the new version
   - Updates `src/version.ts` with the new version (via the `version` script hook)
   - Creates a git commit with both changes
   - Creates a version tag (e.g., `v1.0.1`)

3. **Push the commit and tag**:
   ```bash
   git push --follow-tags
   ```

4. **Automatic workflow execution**:
   - GitHub Actions workflow triggers on the `v*` tag
   - Builds and tests the package
   - Publishes to npm using OIDC (no tokens needed!)
   - Creates a GitHub release with:
     - Changelog from git commits
     - Installation instructions
