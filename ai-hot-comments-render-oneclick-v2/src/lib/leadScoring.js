function normalizeText(value, maxLength = 1000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function parseBudgetValue(value) {
  const raw = normalizeText(value, 100).toLowerCase();
  if (!raw) return 0;

  const normalized = raw
    .replace(/usd|us\$|\$/g, '')
    .replace(/rmb|cny|¥/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ');

  const matches = [
    ...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(k|千|w|万)?/gi)
  ];

  if (!matches.length) return 0;

  const values = matches
    .map((match) => {
      let amount = Number(match[1] || 0);
      const unit = (match[2] || '').toLowerCase();

      if (unit === 'k' || unit === '千') {
        amount *= 1000;
      } else if (unit === 'w' || unit === '万') {
        amount *= 10000;
      }

      return amount;
    })
    .filter((num) => Number.isFinite(num) && num > 0);

  if (!values.length) return 0;

  const looksLikeRange =
    values.length >= 2 &&
    /(\-|~|～|至|到|–|—|between|from)/i.test(normalized);

  // 对分层判断，区间预算取下限更稳，避免把“3000-5000/月”误判成超高预算
  if (looksLikeRange) {
    return Math.min(...values);
  }

  return values[0];
}

function addKeywordScore(text, keywords, points) {
  return keywords.reduce((score, keyword) => {
    return score + (text.includes(keyword) ? points : 0);
  }, 0);
}

const SEGMENT_RULES = {
  '老板/公司': {
    strongKeywords: [
      '老板',
      '投资人',
      '市场进入',
      '进入乌兹',
      '进入市场',
      '本地对接',
      '本地资源',
      '渠道撮合',
      '落地陪跑',
      '工厂落地'
    ],
    weakKeywords: ['公司', '渠道', '落地'],
    recommendedOffer: '市场进入诊断 / 本地资源对接 / 老板级落地陪跑'
  },
  '小团队': {
    strongKeywords: [
      '团队',
      '项目组',
      '持续监控',
      '定制情报',
      '线索池',
      '协同',
      '作战台',
      '月更新',
      '每月更新'
    ],
    weakKeywords: ['项目', '监控', '月'],
    recommendedOffer: '定制情报监控 / 小团队作战台 / 月陪跑'
  },
  '个人用户': {
    strongKeywords: [
      '试水',
      '兼职',
      '个人',
      '副业',
      '自己做',
      '轻量',
      '先试试',
      '先看看'
    ],
    weakKeywords: ['想了解', '学习一下'],
    recommendedOffer: '周机会包 / 行业包 / 机会诊断会'
  }
};

export function inferCustomerSegment(payload = {}) {
  const company = normalizeText(payload.company, 200).toLowerCase();
  const demand = normalizeText(payload.demand, 500).toLowerCase();
  const budgetText = normalizeText(payload.budget, 100).toLowerCase();
  const notes = normalizeText(payload.notes, 500).toLowerCase();
  const joined = [company, demand, budgetText, notes].filter(Boolean).join(' ');

  const scores = {
    '个人用户': 0,
    '小团队': 0,
    '老板/公司': 0
  };

  scores['老板/公司'] += addKeywordScore(
    joined,
    SEGMENT_RULES['老板/公司'].strongKeywords,
    3
  );
  scores['老板/公司'] += addKeywordScore(
    joined,
    SEGMENT_RULES['老板/公司'].weakKeywords,
    1
  );

  scores['小团队'] += addKeywordScore(
    joined,
    SEGMENT_RULES['小团队'].strongKeywords,
    3
  );
  scores['小团队'] += addKeywordScore(
    joined,
    SEGMENT_RULES['小团队'].weakKeywords,
    1
  );

  scores['个人用户'] += addKeywordScore(
    joined,
    SEGMENT_RULES['个人用户'].strongKeywords,
    3
  );
  scores['个人用户'] += addKeywordScore(
    joined,
    SEGMENT_RULES['个人用户'].weakKeywords,
    1
  );

  const budgetValue = parseBudgetValue(budgetText);

  if (budgetValue >= 20000) {
    scores['老板/公司'] += 2;
  } else if (budgetValue >= 3000) {
    scores['小团队'] += 1;
  }

  if (company) {
    scores['小团队'] += 1;
  }

  if (
    scores['老板/公司'] >= 4 &&
    scores['老板/公司'] > scores['小团队']
  ) {
    return '老板/公司';
  }

  if (scores['小团队'] >= 3) {
    return '小团队';
  }

  if (scores['个人用户'] >= 3) {
    return '个人用户';
  }

  if (scores['老板/公司'] >= 3) {
    return '老板/公司';
  }

  if (scores['小团队'] >= 1) {
    return '小团队';
  }

  return '个人用户';
}

export function recommendOffer(segment) {
  return (
    SEGMENT_RULES[segment]?.recommendedOffer ||
    SEGMENT_RULES['个人用户'].recommendedOffer
  );
}

export function scoreLead(payload = {}) {
  const segment = inferCustomerSegment(payload);
  return {
    segment,
    recommendedOffer: recommendOffer(segment)
  };
}
