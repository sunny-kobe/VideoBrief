import type {
  ProductionWorkflowAutomaticAction,
  ProductionWorkflowAutomaticFailure,
} from './productionWorkflow';

interface RunnerStage {
  id: string;
  label: string;
  responsibility: 'automatic' | 'operator_review' | 'human_gate';
}

export interface WorkflowRunnerSnapshot {
  workflow: {
    next: RunnerStage | null;
    automaticAction: ProductionWorkflowAutomaticAction | null;
    activity: {
      action: Exclude<ProductionWorkflowAutomaticAction, 'package'>;
      state: string;
      message: string;
    } | null;
    failure: ProductionWorkflowAutomaticFailure | null;
  };
}

export interface WorkflowRunnerAdvanceResult extends WorkflowRunnerSnapshot {
  action: ProductionWorkflowAutomaticAction | null;
}

export interface WorkflowRunnerResult {
  state: 'awaiting_human' | 'awaiting_review' | 'completed' | 'idle';
  automaticActions: ProductionWorkflowAutomaticAction[];
  next: RunnerStage | null;
  snapshot: WorkflowRunnerSnapshot;
}

export async function runWorkflowUntilGate(dependencies: {
  read: () => Promise<WorkflowRunnerSnapshot>;
  advance: () => Promise<WorkflowRunnerAdvanceResult>;
  waitForActivity: (action: Exclude<ProductionWorkflowAutomaticAction, 'package'>) => Promise<void>;
  onProgress?: (message: string) => void;
  maxAutomaticActions?: number;
}): Promise<WorkflowRunnerResult> {
  const automaticActions: ProductionWorkflowAutomaticAction[] = [];
  const maximum = Math.max(1, dependencies.maxAutomaticActions ?? 12);

  for (;;) {
    const snapshot = await dependencies.read();
    if (snapshot.workflow.failure) {
      throw new Error(`${snapshot.workflow.failure.action} 失败：${snapshot.workflow.failure.message}`);
    }
    if (snapshot.workflow.activity) {
      dependencies.onProgress?.(snapshot.workflow.activity.message);
      await dependencies.waitForActivity(snapshot.workflow.activity.action);
      continue;
    }

    const action = snapshot.workflow.automaticAction;
    if (!action) {
      return {
        state: snapshot.workflow.next?.responsibility === 'human_gate'
          ? 'awaiting_human'
          : snapshot.workflow.next?.responsibility === 'operator_review'
            ? 'awaiting_review'
          : snapshot.workflow.next
            ? 'idle'
            : 'completed',
        automaticActions,
        next: snapshot.workflow.next,
        snapshot,
      };
    }
    if (automaticActions.length >= maximum) {
      throw new Error(`自动生产超过 ${maximum} 个步骤，可能存在状态循环。`);
    }

    dependencies.onProgress?.(`开始自动步骤：${action}`);
    const started = await dependencies.advance();
    if (started.action !== action) {
      throw new Error(`自动步骤状态漂移：预期 ${action}，实际 ${started.action ?? 'none'}。`);
    }
    automaticActions.push(action);
    if (action !== 'package') await dependencies.waitForActivity(action);
  }
}
