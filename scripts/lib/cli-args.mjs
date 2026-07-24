export function parseCliArgs(argv) {
  const args = new Map();
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const separator = body.indexOf('=');
    if (separator >= 0) {
      args.set(body.slice(0, separator), body.slice(separator + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next != null && !next.startsWith('--')) {
      args.set(body, next);
      index += 1;
      continue;
    }
    args.set(body, true);
  }
  return { args, positional };
}
