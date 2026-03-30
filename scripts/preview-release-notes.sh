#!/bin/bash

# Preview release notes generator
# This simulates what the GitHub Actions workflow will generate

set -e

echo "Generating release notes preview..."
echo ""

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version in package.json: $CURRENT_VERSION"
echo ""

# Get the most recent version tag by version order
PREV_TAG=$(git tag -l 'v*' --sort=-version:refname | head -1)

# Check if current version already has a tag
if git tag -l "v${CURRENT_VERSION}" | grep -q .; then
    echo "Version v${CURRENT_VERSION} is already tagged."
    echo "   Showing what will be in the next release."
    PREV_TAG="v${CURRENT_VERSION}"
fi

if [ -z "$PREV_TAG" ]; then
    echo "No previous tag found"
    exit 1
fi

echo "Generating changelog from $PREV_TAG to HEAD"
echo ""

# Get release date
RELEASE_DATE=$(date +%Y-%m-%d)
VERSION=$CURRENT_VERSION

# Generate changelog with categorization
# Use tab as delimiter to safely handle semicolons and special characters
COMMITS=$(git log ${PREV_TAG}..HEAD --pretty=format:"%s	%h" --no-merges)

if [ -z "$COMMITS" ]; then
    echo "No new commits since $PREV_TAG"
    echo ""
    echo "Using last 5 commits as example:"
    COMMITS=$(git log --pretty=format:"%s	%h" --no-merges -5)
fi

# Determine repository path from git remote
REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
if [[ -z "$REMOTE_URL" ]]; then
    REPO_PATH="getformo/sdk-react-native"
else
    REPO_PATH=$(echo "$REMOTE_URL" | sed -E 's#.*github.com[:/]([^/]+/[^/]+)(\.git)?$#\1#')
fi

# Process commits and categorize
FEATURES=""
FIXES=""
OTHER=""

while IFS=$'\t' read -r message hash; do
    # Skip empty lines
    [ -z "$message" ] && continue

    # Extract PR number if exists
    if [[ $message =~ \(#([0-9]+)\) ]]; then
        PR_NUM="${BASH_REMATCH[1]}"
        # Remove the (#PR_NUM) from message to avoid duplication (handles with or without space)
        CLEAN_MESSAGE=$(echo "$message" | sed -E 's/ ?\(#[0-9]+\)//')
        ITEM="$CLEAN_MESSAGE ([#$PR_NUM](https://github.com/$REPO_PATH/pull/$PR_NUM)) ([$hash](https://github.com/$REPO_PATH/commit/$hash))"
    else
        ITEM="$message ([$hash](https://github.com/$REPO_PATH/commit/$hash))"
    fi

    # Categorize by prefix and strip conventional commit prefix
    if [[ $message =~ ^feat(\([^\)]+\))?: ]]; then
        # Strip "feat:" or "feat(scope):" from the beginning of ITEM
        STRIPPED_ITEM=$(echo "$ITEM" | sed -E 's/^feat(\([^)]+\))?: //')
        FEATURES="${FEATURES}- ${STRIPPED_ITEM}
"
    elif [[ $message =~ ^fix(\([^\)]+\))?: ]]; then
        # Strip "fix:" or "fix(scope):" from the beginning of ITEM
        STRIPPED_ITEM=$(echo "$ITEM" | sed -E 's/^fix(\([^)]+\))?: //')
        FIXES="${FIXES}- ${STRIPPED_ITEM}
"
    else
        OTHER="${OTHER}- ${ITEM}
"
    fi
done <<< "$COMMITS"

# Create preview
cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RELEASE NOTES PREVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$VERSION ($RELEASE_DATE)
EOF

# Add Features section if exists
if [ -n "$FEATURES" ]; then
    cat <<EOF

## Features

$FEATURES
EOF
fi

# Add Fixes section if exists
if [ -n "$FIXES" ]; then
    cat <<EOF

## Bug Fixes

$FIXES
EOF
fi

# Add Other changes if exists
if [ -n "$OTHER" ]; then
    cat <<EOF

## Changes

$OTHER
EOF
fi

# Add npm package link
cat <<EOF

## Install

\`\`\`bash
npm install @formo/analytics-react-native@$VERSION
\`\`\`

[@formo/analytics-react-native $VERSION npm package](https://www.npmjs.com/package/@formo/analytics-react-native/v/$VERSION)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Note: This is a preview based on commits since $PREV_TAG
   The actual release notes will be generated when you run:

   npm version patch  # (or minor/major)
   git push --follow-tags

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
