// 순위에 공개되는 이름에서 욕설·광고 문구를 거른다.
// shortcut: 목록 기반이라 새 변형은 못 잡는다. 신고가 쌓이면 목록에 더하거나 외부 분류기를 붙인다.

const PROFANITY = [
  // 한국어 욕설 (초성 포함)
  '시발', '씨발', '씨바', '씨빨', '시빨', '씨팔', '시팔', '쓰발', '씹', 'ㅅㅂ', 'ㅆㅂ', 'ㅅㅃ',
  '병신', '븅신', '빙신', '병싄', 'ㅂㅅ', '좆', '좇', 'ㅈ같', '존나', '졸라', 'ㅈㄴ',
  '개새', '개색', '개세끼', '새끼', '섀끼', '쌔끼', 'ㅅㄲ', '지랄', 'ㅈㄹ', '닥쳐', '꺼져',
  '미친년', '미친놈', '미친새', '엠창', '니미', '느금', '느개비', '니애미', '애미', '애비', '에미',
  '염병', '썅', '쌍년', '쌍놈', '걸레', '보지', '자지', '섹스', '야동', '창녀', '창놈',
  '한남충', '김치녀', '메갈', '일베', '틀딱', '급식충', '장애인새', '정신병자',
  // 영어
  'fuck', 'fuk', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'porn', 'sex', 'nigg', 'cunt', 'slut', 'whore',
];

const ADS = [
  '광고', '홍보', '카톡', '카카오톡', '오픈채팅', '오픈톡', '텔레', '텔그', '디엠', '문의',
  '토토', '카지노', '바카라', '슬롯', '먹튀', '대출', '리딩방', '코인방', '부업', '수익보장', '고수익',
  '쿠폰', '할인', '구독', '팔로우', '맞팔', '유튜브', '인스타', '틱톡',
  'telegram', 'kakao', 'casino', 'toto', 'discord', 'instagram', 'youtube', 'tiktok', 'follow',
];

// NFKC 로 전각·호환 문자를 펴고, 글자(한글·자모·라틴)와 숫자만 남긴다
const squash = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{Script=Hangul}a-z0-9]/gu, '');
// 목록도 같은 규칙으로 편다: NFKC 는 호환 자모(ㅅ U+3145)를 다른 코드(U+1109)로 바꾸므로 그대로 비교하면 초성 욕설을 놓친다
const WORDS = [...PROFANITY, ...ADS].map(squash);

export function isBlockedName(name) {
  const raw = name.normalize('NFKC').toLowerCase();
  if (/https?:|www\.|\.(com|net|kr|io|me|ly|gg|xyz|co)\b|@/.test(raw)) return true; // 주소·계정
  const s = squash(name);
  if (/\d{6,}/.test(s)) return true;          // 전화번호·계좌 같은 긴 숫자
  const letters = s.replace(/\d/g, '');       // 시1발, 씨8발 처럼 숫자를 끼워 넣은 경우
  return WORDS.some(w => s.includes(w) || letters.includes(w));
}
