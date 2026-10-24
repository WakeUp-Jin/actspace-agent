# 文件工具真实 Runtime 补测（2026-10-22）

主仓库固定构建，真实CLI/Runtime/文件系统、回环HTTP受控Provider。只使用独立 workspace，不改用户文件；非真实商业模型，也不代签Desktop变更卡/交付卡UI。

14个有序工具调用，15次实际HTTP请求，Provider收到真实工具结果：

- list_directory、glob、grep 正确返回独立夹具路径及内容。
- read_file 按offset/limit分页，并经指向同一文件的相对symlink读取第二行。
- write_file → read_file → edit_file → force read_file 返回一致，最终磁盘内容精确为 `new value\nkeep\n`，原始seed保持不变。
- present 声明现存输出，Runtime返回 Presented out/result.txt。
- delete_file 即使 full-access 仍需broker审批；当前headless CLI没有broker，两个删除尝试均为 broker-unavailable，退出4/approval_required；文件与目录均保留，未绕过权限。这是当前边界，未据此登记Bug；批准后删除/目录拒绝仍需有broker路线。
- missing.txt读取返回不存在错误，未伪造内容。

证据 filesystem-runtime-20261022/{results.json,requests.json,stdout.json,stderr.txt}；日志 filesystem-runtime-20261022.log。当前UI的变更/交付卡和大输出回读仍保留未覆盖。
