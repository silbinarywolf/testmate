let gFlags: CommandFlags | undefined;

export interface CommandFlags {
    isVerbose: boolean;
    isHelp: boolean;
    isWatchMode: boolean;
}

// getArguments passed into command
export function getArguments(): CommandFlags {
  if (gFlags !== undefined) {
    return gFlags;
  }
  const flags: CommandFlags = {
    isVerbose: false,
    isHelp: false,
    isWatchMode: false,
  }
  var argList = process.argv.slice(2);
  if (argList.length > 0) {
    const firstCommand = argList[0];
    if (firstCommand === 'help') {
      argList = argList.slice(1);
      flags.isHelp = true;
    }
  }
  for (let i = 0; i < argList.length; i++) {
    const arg = argList[i];
    if (arg === '-verbose' || arg === '--verbose' ||
      arg === '-v' || arg === '--v') {
      flags.isVerbose = true;
      continue;
    }
    if (arg === '-help' || arg === '--help') {
      flags.isHelp = true;
      continue;
    }
    if (arg === '-watch' || arg === '--watch') {
      flags.isWatchMode = true;
      continue;
    }
  }
  gFlags = flags;
  return flags;
}
