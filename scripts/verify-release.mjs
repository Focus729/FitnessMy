import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function run(commands, runner = spawnSync) {
  for (const [command, args, env] of commands) {
    const result = runner(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    if (result.error || result.status !== 0)
      throw new Error(`Release gate stopped: ${args.join(' ')}`);
  }
}

if (process.argv.includes('--self-test')) {
  let executed = 0;
  let stopped = false;
  try {
    run(
      [
        [process.execPath, ['-e', 'process.exit(7)']],
        [process.execPath, ['-e', 'process.exit(0)']],
      ],
      (...args) => {
        executed++;
        return spawnSync(...args);
      },
    );
  } catch {
    stopped = true;
  }
  if (!stopped || executed !== 1) throw new Error('Failure gate did not stop subsequent work');
  console.log('Failure gate verified: the failing check prevented all subsequent commands.');
} else {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run through npm run check:release');
  const cloud = process.argv.includes('--cloud');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (cloud && git('status', '--porcelain')) throw new Error('Commit the cloud release source before verification');
  const revision = cloud ? git('rev-parse', 'HEAD') : undefined;
  const env = cloud
    ? { APP_BASE_PATH: '/', VITE_CLOUD_ENABLED: 'true', BUILD_REVISION: revision, CI: '1' }
    : { APP_BASE_PATH: '/' };
  const commands = ['lint', 'test', 'check:contrast', 'check:spec', 'e2e'].map((script) => [
    process.execPath,
    [npmCli, 'run', script],
    env,
  ]);
  if (cloud) {
    commands.splice(1, 0, ...['check:backend', 'test:backend', 'e2e:storage'].map((script) => [
      process.execPath, [npmCli, 'run', script], env,
    ]));
  }
  commands.push([process.execPath, [npmCli, 'run', 'build'], cloud ? env : { APP_BASE_PATH: '/FitnessMy/' }]);
  if (cloud)
    commands.push([process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy',
      '--config', 'wrangler.production.jsonc', '--dry-run', '--outdir', '.wrangler/production-dry-run'], env]);
  run(commands);
  if (cloud) {
    const build = JSON.parse(readFileSync('dist/build-info.json', 'utf8'));
    if (build.revision !== revision || git('rev-parse', 'HEAD') !== revision || git('status', '--porcelain'))
      throw new Error('Cloud release source changed or the build marker does not match');
  }
  console.log(
    'Local release checks passed. Publication and deployed verification are separate required steps.',
  );
}
