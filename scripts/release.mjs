console.log(`To publish Dinox:
1. bun run bump <major.minor.patch>
2. Review RELEASE_NOTES.md, run bun test and bun run build
3. Commit the release changes
4. git tag v<major.minor.patch>
5. git push origin main --follow-tags (or push the explicit tag)
The signed release workflow runs only for v* tags. No files or Git refs were changed.`);
