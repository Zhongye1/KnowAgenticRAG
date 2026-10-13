/**
 * 对话页的 antd 输入控件适配。
 *
 * Input / Textarea 换成 antd 的同名控件：受控用法（value + onChange）与 ref 转发
 * 一致，调用方只改 import。antd 的 `variant` 外观由 ConfigProvider token 承载，
 * 这里不做外观映射。
 */
import { Input as AntdInput } from 'antd';

export const Input = AntdInput;
export const Textarea = AntdInput.TextArea;
