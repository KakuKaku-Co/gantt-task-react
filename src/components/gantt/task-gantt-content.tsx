import React, { useEffect, useState } from "react";
import { EventOption } from "../../types/public-types";
import { BarTask } from "../../types/bar-task";
import { Arrow } from "../other/arrow";
import { handleTaskBySVGMouseEvent } from "../../helpers/bar-helper";
import { isKeyboardEvent } from "../../helpers/other-helper";
import { TaskItem } from "../task-item/task-item";
import {
  BarMoveAction,
  GanttContentMoveAction,
  GanttEvent,
} from "../../types/gantt-task-actions";

export type TaskGanttContentProps = {
  tasks: BarTask[];
  dates: Date[];
  ganttEvent: GanttEvent;
  selectedTask: BarTask | undefined;
  rowHeight: number;
  columnWidth: number;
  timeStep: number;
  svg?: React.RefObject<SVGSVGElement>;
  svgWidth: number;
  taskHeight: number;
  arrowColor: string;
  arrowIndent: number;
  fontSize: string;
  fontFamily: string;
  rtl: boolean;
  setGanttEvent: (value: GanttEvent) => void;
  setFailedTask: (value: BarTask | null) => void;
  setSelectedTask: (taskId: string) => void;
} & EventOption;

export const TaskGanttContent: React.FC<TaskGanttContentProps> = ({
  tasks,
  dates,
  ganttEvent,
  selectedTask,
  rowHeight,
  columnWidth,
  timeStep,
  svg,
  taskHeight,
  arrowColor,
  arrowIndent,
  fontFamily,
  fontSize,
  rtl,
  setGanttEvent,
  setFailedTask,
  setSelectedTask,
  onDateChange,
  onProgressChange,
  onDoubleClick,
  onClick,
  onDelete,
}) => {
  const point = svg?.current?.createSVGPoint();
  const [xStep, setXStep] = useState(0);
  const [initEventX1Delta, setInitEventX1Delta] = useState(0);
  const [isMoving, setIsMoving] = useState(false);

  // create xStep
  useEffect(() => {
    const dateDelta =
      dates[1].getTime() -
      dates[0].getTime() -
      dates[1].getTimezoneOffset() * 60 * 1000 +
      dates[0].getTimezoneOffset() * 60 * 1000;
    const newXStep = (timeStep * columnWidth) / dateDelta;
    setXStep(newXStep);
  }, [columnWidth, dates, timeStep]);

  useEffect(() => {
    const handleMouseMove = async (event: MouseEvent) => {
      if (!ganttEvent.changedTask || !point || !svg?.current) return;
      event.preventDefault();

      point.x = event.clientX;
      const cursor = point.matrixTransform(
        svg?.current.getScreenCTM()?.inverse()
      );

      const { isChanged, changedTask } = handleTaskBySVGMouseEvent(
        cursor.x,
        ganttEvent.action as BarMoveAction,
        ganttEvent.changedTask,
        xStep,
        timeStep,
        initEventX1Delta,
        rtl
      );
      if (isChanged) {
        setGanttEvent({ action: ganttEvent.action, changedTask });
      }
    };

    const handleMouseUp = async (event: MouseEvent) => {
      const { action, originalSelectedTask, changedTask } = ganttEvent;
      if (!changedTask || !point || !svg?.current || !originalSelectedTask)
        return;
      event.preventDefault();

      point.x = event.clientX;
      const cursor = point.matrixTransform(
        svg?.current.getScreenCTM()?.inverse()
      );
      const { changedTask: newChangedTask } = handleTaskBySVGMouseEvent(
        cursor.x,
        action as BarMoveAction,
        changedTask,
        xStep,
        timeStep,
        initEventX1Delta,
        rtl
      );

      const isNotLikeOriginal =
        originalSelectedTask.start !== newChangedTask.start ||
        originalSelectedTask.end !== newChangedTask.end ||
        originalSelectedTask.progress !== newChangedTask.progress;

      // remove listeners
      svg.current.removeEventListener("mousemove", handleMouseMove);
      svg.current.removeEventListener("mouseup", handleMouseUp);
      setGanttEvent({ action: "" });
      setIsMoving(false);

      // custom operation start
      let operationSuccess = true;
      if (
        (action === "move" || action === "end" || action === "start") &&
        onDateChange &&
        isNotLikeOriginal
      ) {
        try {
          const result = await onDateChange(
            newChangedTask,
            newChangedTask.barChildren
          );
          if (result !== undefined) {
            operationSuccess = result;
          }
        } catch (error) {
          operationSuccess = false;
        }
      } else if (onProgressChange && isNotLikeOriginal) {
        try {
          const result = await onProgressChange(
            newChangedTask,
            newChangedTask.barChildren
          );
          if (result !== undefined) {
            operationSuccess = result;
          }
        } catch (error) {
          operationSuccess = false;
        }
      }

      // If operation is failed - return old state
      if (!operationSuccess) {
        setFailedTask(originalSelectedTask);
      }
    };

    if (
      !isMoving &&
      (ganttEvent.action === "move" ||
        ganttEvent.action === "end" ||
        ganttEvent.action === "start" ||
        ganttEvent.action === "progress") &&
      svg?.current
    ) {
      svg.current.addEventListener("mousemove", handleMouseMove);
      svg.current.addEventListener("mouseup", handleMouseUp);
      setIsMoving(true);
    }
  }, [
    ganttEvent,
    xStep,
    initEventX1Delta,
    onProgressChange,
    timeStep,
    onDateChange,
    svg,
    isMoving,
    point,
    rtl,
    setFailedTask,
    setGanttEvent,
  ]);

  /**
   * Method is Start point of task change
   */
  const handleBarEventStart = async (
    action: GanttContentMoveAction,
    task: BarTask,
    event?: React.MouseEvent | React.KeyboardEvent
  ) => {
    if (!event) {
      if (action === "select") {
        setSelectedTask(task.id);
      }
    }
    // Keyboard events
    else if (isKeyboardEvent(event)) {
      if (action === "delete") {
        if (onDelete) {
          try {
            const result = await onDelete(task);
            if (result !== undefined && result) {
              setGanttEvent({ action, changedTask: task });
            }
          } catch (error) {
            console.error("Error on Delete. " + error);
          }
        }
      }
    }
    // Mouse Events
    else if (action === "mouseenter") {
      if (!ganttEvent.action) {
        setGanttEvent({
          action,
          changedTask: task,
          originalSelectedTask: task,
        });
      }
    } else if (action === "mouseleave") {
      if (ganttEvent.action === "mouseenter") {
        setGanttEvent({ action: "" });
      }
    } else if (action === "dblclick") {
      !!onDoubleClick && onDoubleClick(task);
    } else if (action === "click") {
      !!onClick && onClick(task);
    }
    // Change task event start
    else if (action === "move") {
      if (!svg?.current || !point) return;
      point.x = event.clientX;
      const cursor = point.matrixTransform(
        svg.current.getScreenCTM()?.inverse()
      );
      setInitEventX1Delta(cursor.x - task.x1);
      setGanttEvent({
        action,
        changedTask: task,
        originalSelectedTask: task,
      });
    } else {
      setGanttEvent({
        action,
        changedTask: task,
        originalSelectedTask: task,
      });
    }
  };

// 日毎の集計を計算する関数
const calculateDailyTotals = (tasks: BarTask[], dates: Date[], propName: 'seconds' | 'remaining' = 'seconds'): Map<string, number> => {
  const totals = new Map<string, number>(dates.map((date:any) => [date.toLocaleDateString('ja-JP'), 0]));

  tasks.forEach((task:any) => {
    const startDate = new Date(task.start);
    const endDate = new Date(task.end);

    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      const dateKey = date.toLocaleDateString('ja-JP');
      if (totals.has(dateKey)) {
        const currentTotal = totals.get(dateKey);
        totals.set(dateKey, currentTotal + task[propName]);
      }
    }
  });
  return totals;
};

// ステートとして日毎の集計を管理
const [dailyTotalsWithSeconds, setDailyTotalsWithSeconds] = useState<Map<string, number>>(new Map());
const [dailyTotalsWithRemaining, setDailyTotalsWithRemaining] = useState<Map<string, number>>(new Map());
// 初回レンダリング時にのみ計算を実行
useEffect(() => {
  setDailyTotalsWithSeconds(calculateDailyTotals(tasks, dates, 'seconds'));
  setDailyTotalsWithRemaining(calculateDailyTotals(tasks, dates, 'remaining'));
}, [tasks, dates]); // 依存配列に tasks と dates を指定


  return (
    <g className="content">
      <g className="arrows" fill={arrowColor} stroke={arrowColor}>
        {tasks.map(task => {
          return task.barChildren.map(child => {
            return (
              <Arrow
                key={`Arrow from ${task.id} to ${tasks[child.index].id}`}
                taskFrom={task}
                taskTo={tasks[child.index]}
                rowHeight={rowHeight}
                taskHeight={taskHeight}
                arrowIndent={arrowIndent}
                rtl={rtl}
              />
            );
          });
        })}
      </g>
      <g className="bar" fontFamily={fontFamily} fontSize={fontSize}>
        {tasks.map(task => {
          return (
            <TaskItem
              task={task}
              arrowIndent={arrowIndent}
              taskHeight={taskHeight}
              isProgressChangeable={!!onProgressChange && !task.isDisabled}
              isDateChangeable={!!onDateChange && !task.isDisabled}
              isDelete={!task.isDisabled}
              onEventStart={handleBarEventStart}
              key={task.id}
              isSelected={!!selectedTask && task.id === selectedTask.id}
              rtl={rtl}
            />
          );
        })}
      </g>
      {Array.from(dailyTotalsWithSeconds).map(([dateKey, totalSeconds], index) => (
        <text
          key={dateKey}
          x={(index+1) * columnWidth - (columnWidth / 2)}
          y={(tasks.length - 1) * rowHeight - (rowHeight / 2.5)}
          fontSize={fontSize}
          fontFamily={fontFamily}
          fill="black"
          textAnchor="middle"
        >
          {totalSeconds}
        </text>
      ))}
      {Array.from(dailyTotalsWithRemaining).map(([dateKey, totalSeconds], index) => (
        <text
          key={dateKey}
          x={(index+1) * columnWidth - (columnWidth / 2)}
          y={(tasks.length) * rowHeight - (rowHeight / 2.5)}
          fontSize={fontSize}
          fontFamily={fontFamily}
          fill="black"
          textAnchor="middle"
        >
          {totalSeconds}
        </text>
      ))}
    </g>
  );
};
