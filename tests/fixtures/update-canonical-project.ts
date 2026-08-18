import { updateCanonicalProject } from '../../src/shortVideoProjectServer';

function flag(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? '';
}

const projectId = flag('project');
const field = flag('field');
const value = flag('value');
const delay = Number(flag('delay')) || 0;

if (!['whyItMatters', 'chinaContext'].includes(field)) throw new Error(`Unsupported field: ${field}`);

updateCanonicalProject(projectId, (project) => {
  if (delay > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
  }
  return {
    ...project,
    editorial: {
      ...project.editorial,
      [field]: value,
    },
  };
});
