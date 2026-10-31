import { spawnSync } from 'node:child_process';

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
  const commands = ['lint', 'test', 'check:contrast', 'check:spec', 'e2e'].map((script) => [
    process.execPath,
    [npmCli, 'run', script],
    { APP_BASE_PATH: '/' },
  ]);
  commands.push([process.execPath, [npmCli, 'run', 'build'], { APP_BASE_PATH: '/FitnessMy/' }]);
  run(commands);
  console.log(
    'Local release checks passed. Publication and deployed verification are separate required steps.',
  );
}
