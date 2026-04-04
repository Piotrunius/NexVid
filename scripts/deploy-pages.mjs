import { execSync } from 'node:child_process';

function parseBranch(argv) {
    const branchFlagIndex = argv.findIndex((arg) => arg === '--branch' || arg.startsWith('--branch='));
    if (branchFlagIndex === -1) return 'main';

    const flag = argv[branchFlagIndex];
    if (flag.includes('=')) {
        const value = flag.split('=', 2)[1]?.trim();
        return value || 'main';
    }

    const nextValue = argv[branchFlagIndex + 1]?.trim();
    return nextValue || 'main';
}

function isTransientPagesError(error) {
    const message = [error?.message, error?.stderr, error?.stdout]
        .filter(Boolean)
        .map((value) => String(value))
        .join('\n');

    const lower = message.toLowerCase();

    return message.includes('504')
        || message.includes('502')
        || message.includes('503')
        || message.includes('Service unavailable')
        || message.includes('[code: 7010]')
        || message.includes('Gateway Timeout')
        || message.includes('upstream request timeout')
        || message.includes('malformed response from the API')
        || lower.includes('temporarily unavailable')
        || lower.includes('please try again')
        || lower.includes('network connection lost');
}

function run(command) {
    execSync(command, { stdio: 'inherit' });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const branch = parseBranch(process.argv.slice(2));

    console.log(`\n📦 Building Pages output for branch "${branch}"...`);
    run('bun run pages:build-output');
    run('bun run pages:prepare');

    const deployCommand = `bunx wrangler pages deploy .vercel/output/static --project-name nexvid --branch ${branch}`;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            console.log(`\n🚀 Deploying Pages (attempt ${attempt}/${maxAttempts})...`);
            run(deployCommand);
            console.log(`\n✨ Pages deployed successfully to branch "${branch}"!\n`);
            return;
        } catch (error) {
            if (attempt < maxAttempts && isTransientPagesError(error)) {
                const waitMs = attempt * 5000;
                console.warn(`\n⚠️ Cloudflare Pages returned a transient error. Retrying in ${waitMs / 1000}s...`);
                await sleep(waitMs);
                continue;
            }

            throw error;
        }
    }
}

main().catch((error) => {
    console.error('\n❌ Pages deployment failed:', error?.message || error);
    process.exit(1);
});
