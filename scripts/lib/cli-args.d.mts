export function parseCliArgs(argv: string[]): {
  args: Map<string, string | true>;
  positional: string[];
};
