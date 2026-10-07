import { useRef } from "react";

/**
 * 字段逐个 Object.is 相等时返回上一次的对象，供 Context value 这类需要引用稳定的对象使用。
 * 和 useMemo 的区别是没有工厂函数。App 这种大组件里，工厂闭包读到的局部变量会进入整个渲染作用域
 * （同一函数里的闭包共用一个作用域），旧作用域又被各个 useCallback 一层层留住，
 * 已归档会话的消息和上下文就一直释放不掉。
 */
export function useShallowStable<T extends object>(value: T): T {
  const ref = useRef(value);
  if (ref.current !== value && !shallowEqual(ref.current, value)) ref.current = value;
  return ref.current;
}

function shallowEqual(a: object, b: object): boolean {
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
}
