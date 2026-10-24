import { memo } from 'react';
import { T } from '../../trajectory';
import { ClockIcon, SearchIcon } from './kind-icons';

export type TrajectoryToolbarProps = {
  readonly actualDuration: boolean;
  readonly onActualDurationChange: (actual: boolean) => void;
  readonly allTurnsCollapsed: boolean;
  readonly onToggleAllTurns: () => void;
  readonly allAssistantsCollapsed: boolean;
  readonly onToggleAllAssistants: () => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** Present while the session is running; the stop control sits at the far right (D1). */
  readonly onAbort?: () => void;
  readonly isAborting?: boolean;
};

/**
 * DSH 轨迹工具栏：时长、轮次、调用、搜索。DSH 隐藏的「实际时间」开关不渲染（K6），
 * 运行中在搜索框右侧多一个「停止」。
 */
export const TrajectoryToolbar = memo(function TrajectoryToolbar(props: TrajectoryToolbarProps) {
  const { actualDuration, allTurnsCollapsed, allAssistantsCollapsed } = props;
  return <div className="tjb-root" role="toolbar" aria-label={T.toolbarAria}>
    <div className="tjb-inner">
      <div className="tjb-actions">
        <button
          type="button"
          className="tjb-toggle"
          aria-label={T.useActualDuration}
          aria-pressed={actualDuration}
          title={actualDuration ? T.useEqualWidth : T.useActualDuration}
          onClick={() => props.onActualDurationChange(!actualDuration)}
        >
          <ClockIcon className="tjb-toggleIcon" />
          {T.duration}
        </button>
        <button
          type="button"
          className="tjb-action"
          aria-label={allTurnsCollapsed ? T.expandTurns : T.collapseTurns}
          aria-pressed={allTurnsCollapsed}
          title={allTurnsCollapsed ? T.expandTurns : T.collapseTurns}
          onClick={props.onToggleAllTurns}
        >
          <span className="tjb-actionIcon" aria-hidden="true">{allTurnsCollapsed ? '⊞' : '⊟'}</span>
          {T.turns}
        </button>
        <button
          type="button"
          className="tjb-action"
          aria-label={allAssistantsCollapsed ? T.expandCalls : T.collapseCalls}
          aria-pressed={allAssistantsCollapsed}
          title={allAssistantsCollapsed ? T.expandCalls : T.collapseCalls}
          onClick={props.onToggleAllAssistants}
        >
          <span className="tjb-actionIcon" aria-hidden="true">{allAssistantsCollapsed ? '⊞' : '⊟'}</span>
          {T.calls}
        </button>
      </div>
      <div className="tjb-search">
        <SearchIcon className="tjb-searchIcon" />
        <input
          type="search"
          className="tjb-searchInput"
          aria-label={T.search}
          placeholder={T.searchPlaceholder}
          value={props.query}
          onChange={event => props.onQueryChange(event.currentTarget.value)}
        />
      </div>
      {props.onAbort && <button type="button" className="tjb-action tjb-stop" disabled={props.isAborting} onClick={props.onAbort}>
        {props.isAborting ? T.stopping : T.stop}
      </button>}
    </div>
  </div>;
});
