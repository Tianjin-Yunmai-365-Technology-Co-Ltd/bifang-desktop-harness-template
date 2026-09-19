import {
  Button,
  Checkbox,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import {
  IconArrowLeft,
  IconArrowRight,
  IconGripVertical,
} from "@tabler/icons-react";
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import type {
  BusinessId,
  ColumnPreferences,
  ListColumnContract,
} from "./listPageState";

const WRAPPING_BUTTON_STYLES = {
  label: { whiteSpace: "normal", overflowWrap: "anywhere" },
} as const;

/** 列设置面板需要的本地化文案。 */
export interface ListColumnSettingsMessages {
  columns: string;
  resetColumns: string;
  dragColumn: (column: string) => string;
  dragInstructions: string;
  dragStarted: (column: string) => string;
  dragCancelled: (column: string) => string;
  moveColumnLeft: (column: string) => string;
  moveColumnRight: (column: string) => string;
  columnPosition: (column: string, position: number, total: number) => string;
}

/** 单个可拖拽列项，同时提供不依赖拖拽手势的左右移动按钮。 */
function SortableColumnOption<TColumnId extends string>(props: {
  id: TColumnId;
  label: string;
  visible: boolean;
  required: boolean;
  position: number;
  total: number;
  messages: ListColumnSettingsMessages;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
}): ReactNode {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
    opacity: isDragging ? 0.65 : 1,
  };
  return (
    <Group ref={setNodeRef} style={style} wrap="wrap" justify="space-between">
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="subtle"
        size="compact-sm"
        aria-label={props.messages.dragColumn(props.label)}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical aria-hidden="true" size={16} />
      </Button>
      <Checkbox
        style={{ flex: "1 1 8rem", minWidth: 0 }}
        checked={props.visible}
        disabled={props.required}
        label={
          <Text size="sm" style={{ overflowWrap: "anywhere" }}>
            {props.label}
          </Text>
        }
        onChange={props.onToggle}
      />
      <Group gap="xs" wrap="wrap">
        <Button
          type="button"
          variant="default"
          size="compact-sm"
          aria-label={props.messages.moveColumnLeft(props.label)}
          disabled={props.position === 0}
          onClick={() => props.onMove(-1)}
        >
          <IconArrowLeft aria-hidden="true" size={16} />
        </Button>
        <Button
          type="button"
          variant="default"
          size="compact-sm"
          aria-label={props.messages.moveColumnRight(props.label)}
          disabled={props.position === props.total - 1}
          onClick={() => props.onMove(1)}
        >
          <IconArrowRight aria-hidden="true" size={16} />
        </Button>
      </Group>
    </Group>
  );
}

/** 列设置面板集中拥有拖拽、按钮移动、显隐与位置播报。 */
export function ListColumnSettings<
  TColumnId extends string,
  TSortField extends string,
>(props: {
  columns: readonly ListColumnContract<TColumnId, TSortField>[];
  preferences: ColumnPreferences<TColumnId>;
  messages: ListColumnSettingsMessages;
  onPreferencesChange: (next: ColumnPreferences<TColumnId>) => void;
  onToggle: (column: ListColumnContract<TColumnId, TSortField>) => void;
  onReset: () => void;
}): ReactNode {
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columnsById = new Map(props.columns.map((column) => [column.id, column]));
  const getDraggedColumn = useCallback(
    (id: BusinessId) => props.columns.find((column) => column.id === id),
    [props.columns],
  );
  const announceColumnPosition = useCallback(
    (activeId: BusinessId, overId: BusinessId) => {
      const column = getDraggedColumn(activeId);
      const position = props.preferences.order.findIndex((id) => id === overId);
      return column === undefined || position < 0
        ? ""
        : props.messages.columnPosition(
            column.accessibleName,
            position + 1,
            props.preferences.order.length,
          );
    },
    [getDraggedColumn, props.messages, props.preferences.order],
  );
  const moveColumn = useCallback(
    (columnId: TColumnId, delta: -1 | 1) => {
      const from = props.preferences.order.indexOf(columnId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= props.preferences.order.length) return;
      props.onPreferencesChange({
        ...props.preferences,
        order: arrayMove([...props.preferences.order], from, to),
      });
      const column = columnsById.get(columnId);
      if (column !== undefined) {
        setAnnouncement(
          props.messages.columnPosition(
            column.accessibleName,
            to + 1,
            props.preferences.order.length,
          ),
        );
      }
    },
    [columnsById, props],
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.over === null || event.active.id === event.over.id) return;
      const activeId = props.preferences.order.find(
        (id) => id === event.active.id,
      );
      const overId = props.preferences.order.find((id) => id === event.over?.id);
      if (activeId === undefined || overId === undefined) return;
      const from = props.preferences.order.indexOf(activeId);
      const to = props.preferences.order.indexOf(overId);
      if (from < 0 || to < 0) return;
      props.onPreferencesChange({
        ...props.preferences,
        order: arrayMove([...props.preferences.order], from, to),
      });
    },
    [props],
  );
  return (
    <Popover
      width="min(420px, calc(100vw - 32px))"
      position="bottom-end"
      withArrow
      shadow="md"
    >
      <Popover.Target>
        <Button
          type="button"
          variant="default"
          h="auto"
          styles={WRAPPING_BUTTON_STYLES}
        >
          {props.messages.columns}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <ScrollArea.Autosize mah="60vh" type="auto">
          <Stack gap="sm">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              accessibility={{
                screenReaderInstructions: {
                  draggable: props.messages.dragInstructions,
                },
                announcements: {
                  onDragStart: ({ active }) => {
                    const column = getDraggedColumn(active.id);
                    return column === undefined
                      ? ""
                      : props.messages.dragStarted(column.accessibleName);
                  },
                  onDragOver: ({ active, over }) =>
                    over === null
                      ? ""
                      : announceColumnPosition(active.id, over.id),
                  onDragEnd: ({ active, over }) =>
                    over === null
                      ? ""
                      : announceColumnPosition(active.id, over.id),
                  onDragCancel: ({ active }) => {
                    const column = getDraggedColumn(active.id);
                    return column === undefined
                      ? ""
                      : props.messages.dragCancelled(column.accessibleName);
                  },
                },
              }}
            >
              <SortableContext
                items={[...props.preferences.order]}
                strategy={verticalListSortingStrategy}
              >
                {props.preferences.order.map((columnId, position) => {
                  const column = columnsById.get(columnId);
                  if (column === undefined) return null;
                  return (
                    <SortableColumnOption
                      key={column.id}
                      id={column.id}
                      label={column.accessibleName}
                      visible={!props.preferences.hidden.includes(column.id)}
                      required={column.required === true}
                      position={position}
                      total={props.preferences.order.length}
                      messages={props.messages}
                      onToggle={() => props.onToggle(column)}
                      onMove={(delta) => moveColumn(column.id, delta)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
            <Button
              type="button"
              variant="subtle"
              h="auto"
              styles={WRAPPING_BUTTON_STYLES}
              onClick={props.onReset}
            >
              {props.messages.resetColumns}
            </Button>
            <VisuallyHidden role="status" aria-live="polite">
              {announcement}
            </VisuallyHidden>
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
