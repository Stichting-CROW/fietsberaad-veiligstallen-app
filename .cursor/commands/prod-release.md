---
description: Create a production release by updating RELEASES.md, committing, pushing, and creating a PR to main
globs: 
alwaysApply: false
---

# PROD Release Command

This command automates the production release process.

## Steps

1. **Check current branch**
   - Verify that the current branch is `acceptance`
   - If not on `acceptance` branch, abort with error message: "Error: You must be on the 'acceptance' branch to create a release. Current branch: {branch_name}"

2. **Pull latest changes**
   - Run `git pull origin acceptance` to ensure we're up to date
   - If this fails, abort with error

3. **Check for uncommitted changes**
   - Check if there are any uncommitted changes using `git diff-index --quiet HEAD --`
   - If there are uncommitted changes, abort with message: "Warning: You have uncommitted changes. Please commit or stash them before running this command."

4. **Get current date**
   - Get the current date in YYYY-MM-DD format (e.g., 2026-01-15)

5. **Find last release date**
   - Read RELEASES.md and find the first line matching `^## VeiligStallen`
   - Extract the date from that line (format: `## VeiligStallen YYYY-MM-DD`)
   - If no previous release found, use a fallback (e.g., last 20 commits)

6. **Get commits since last release**
   - Find the commit that added the last release (search for commit message containing "Add release notes {last_release_date}")
   - Get all commit messages since that commit (excluding merge commits)
   - Format: `git log {commit_since}..HEAD --pretty=format:"%s" --no-merges`
   - If no commits found, ask user if they want to continue anyway

7. **Categorize commits**
   - Categorize commits into:
     - **Features**: commits containing keywords like "feat", "add", "new", "implement"
     - **Bug Fixes**: commits containing keywords like "fix", "bug", "error", "issue"
     - **Improvements**: commits containing keywords like "refactor", "cleanup", "remove", "update", "improve", "optimize"
     - **Technical**: all other commits
   - If categorization doesn't work well, just list all commits under a general section

8. **Create release notes**
   - Create a new section at the top of RELEASES.md (after the header line `# App updates VeiligStallen`)
   - Format:
     ```
     ## VeiligStallen {current_date}

     **Features**

     - {feature commit 1}
     - {feature commit 2}

     **Bug Fixes**

     - {bugfix commit 1}
     - {bugfix commit 2}

     **Improvements**

     - {improvement commit 1}

     **Technical**

     - {technical commit 1}
     ```
   - Only include sections that have commits
   - If no categorization worked, use a single section:
     ```
     ## VeiligStallen {current_date}

     **Features and Bug Fixes**

     - {commit 1}
     - {commit 2}
     ```

9. **Update RELEASES.md**
   - Insert the new release section after the first line (header)
   - Preserve all existing content below

10. **Update version in FooterNav.tsx**
   - Read `src/components/FooterNav.tsx`
   - Find the line containing `<small className="text-xs text-gray-400">v{old_date}</small>`
   - Replace `v{old_date}` with `v{current_date}` (e.g., `v2026-01-06` → `v2026-01-15`)
   - The line should be: `<small className="text-xs text-gray-400">v{current_date}</small>`
   - Save the file

11. **Show release notes to user**
    - Display the generated release notes
    - Ask user to review and confirm before proceeding
    - Allow user to edit if needed

12. **Commit changes**
    - Stage both files: `git add RELEASES.md src/components/FooterNav.tsx`
    - Commit with message: `Add release notes {current_date}`
    - If commit fails, abort with error

13. **Push changes**
    - Push to acceptance branch: `git push origin acceptance`
    - If push fails, abort with error

14. **Create pull request**
    - Check if GitHub CLI (`gh`) is available
    - If available:
      - Check if an open PR already exists: `gh pr list --base main --head acceptance --state open`
      - If PR exists, inform user and complete
      - If no PR exists, create one:
        - Title: `Release {current_date}`
        - Body: `This PR contains the release notes for {current_date}.`
        - Base: `main`
        - Head: `acceptance`
    - If GitHub CLI not available:
      - Get the repository URL from git remote
      - Display the URL for manual PR creation: `https://github.com/{repo}/compare/main...acceptance`

15. **Completion message**
    - Display success message: "✓ PROD release process complete! Release date: {current_date}"

## Error Handling

- All git operations should check for errors and abort with clear error messages
- If any step fails, stop execution and report the error
- Never proceed if not on acceptance branch
- Never proceed with uncommitted changes

## Notes

- The release notes should be categorized by topic (Features, Bug Fixes, Improvements, Technical)
- Commits should be listed as bullet points with their commit messages
- The date format must be YYYY-MM-DD
- The release section must be inserted at the top of RELEASES.md, right after the header
- The version in `src/components/FooterNav.tsx` must be updated to match the current date in the format `v{current_date}` (e.g., `v2026-01-15`)
- Both RELEASES.md and FooterNav.tsx are committed together in the same commit
