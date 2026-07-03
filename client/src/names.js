// 隨機名稱產生器
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 暱稱:[情緒/狀態] 的 [動物/植物]
const MOODS = [
  '憤怒', '微醺', '害羞', '躺平', '發呆', '熬夜', '厭世', '傲嬌',
  '迷路', '暴走', '冷靜', '慌張', '幸福', '偷懶', '元氣滿滿', '睡過頭',
  '裝忙', '放空', '興奮', '佛系',
];
const CREATURES = [
  '馬鈴薯', '北極熊', '柴犬', '酪梨', '水豚', '仙人掌', '企鵝', '樹懶',
  '鴨子', '貓咪', '香菜', '恐龍', '地瓜', '海豹', '小籠包', '含羞草',
  '倉鼠', '花椰菜', '羊駝', '章魚',
];
export const randomNickname = () => `${pick(MOODS)}的${pick(CREATURES)}`;

// 房間名稱:歡樂休閒鹹魚躺平風(前綴 + 後綴)
const ROOM_PREFIXES = [
  '歡樂的', '路過別錯過的', '吃飽太閒的', '半夜不睡覺的', '純聊天',
];
const ROOM_SUFFIXES = ['秘密基地', '休息站', '地瓜球攤位', '聊天室', '停機坪'];
export const randomRoomName = () => `${pick(ROOM_PREFIXES)}${pick(ROOM_SUFFIXES)}`;
