import { Popover, Text, UnstyledButton, VisuallyHidden } from "@mantine/core";
import { useId, type ReactNode } from "react";
import styles from "./ListPage.module.css";

/** 纯文本默认完整换行；省略模式的按钮由鼠标与键盘打开可选择的完整值。 */
export function ListTextCell(props: {
  value: string;
  truncate?: boolean;
  fullValueLabel: string;
  interactive?: boolean;
}): ReactNode {
  const descriptionId = useId();
  if (!props.truncate) return <span className={styles.cellContent}>{props.value}</span>;
  if (props.fullValueLabel.trim().length === 0) throw new Error("ListTextCell requires a non-empty full value label");
  return (
    <Popover withinPortal position="bottom-start" trapFocus returnFocus closeOnEscape>
      <Popover.Target>
        <UnstyledButton
          type="button"
          className={styles.fullValueButton}
          aria-describedby={descriptionId}
          disabled={props.interactive === false}
        >
          <Text component="span" className={styles.truncatedValue} truncate="end">{props.value}</Text>
        </UnstyledButton>
      </Popover.Target>
      <VisuallyHidden id={descriptionId}>{props.fullValueLabel}</VisuallyHidden>
      <Popover.Dropdown className={styles.fullValue} tabIndex={0} data-autofocus aria-label={props.fullValueLabel}>
        <Text>{props.value}</Text>
      </Popover.Dropdown>
    </Popover>
  );
}
