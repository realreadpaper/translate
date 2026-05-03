# YouTube ASR 配置教程

## 什么时候需要 ASR

有 YouTube 字幕轨道的视频会直接使用 timedtext 字幕轨道预翻译，不需要 ASR。只有视频没有可用字幕轨道、字幕轨道为空，或者你开启实验性音频预抓时，才需要 ASR。

## 推荐配置

- Base URL: `https://api.openai.com/v1`
- Model: `whisper-1`
- API Key: 填写你的 ASR 服务密钥

## 配置步骤

1. 打开扩展选项页。
2. 找到“目标能力”区域。
3. 开启“实验性 YouTube 音频预抓”。
4. 填写 `YouTube ASR Base URL`。
5. 填写 `YouTube ASR API Key`。
6. 填写 `YouTube ASR 模型`。
7. 保存设置。
8. 打开一个无字幕 YouTube 视频，点击页面内“译”按钮验证。

## 常见错误

- 401: API Key 不正确，或者该 Key 没有 ASR 权限。
- 404: Base URL 或模型名称不匹配。
- 模型不支持音频: 换成支持 audio transcription 的模型。
- 浏览器没有音频权限: 确认扩展已经启用 `tabCapture` 和 `offscreen` 权限。
- 有字幕视频没有调用 ASR: 这是正常行为，有字幕时优先走 timedtext。

## 验证 ASR 是否生效

1. 打开一个没有字幕轨道的 YouTube 视频。
2. 点击页面右侧悬浮球的“译”按钮。
3. 如果 ASR 配置正确，后台会把音频识别文本转成 `asr-cue-*` 字幕 cue，再进入翻译 overlay。
4. 如果没有配置 API Key，界面会返回“请先配置 YouTube ASR API Key。”。
5. 如果开启了调试日志，可以在 Console 中查看 YouTube 字幕采集、ASR 降级和翻译请求链路。
