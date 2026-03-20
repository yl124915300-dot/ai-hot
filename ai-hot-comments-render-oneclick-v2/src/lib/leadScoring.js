function normalizeText(value, maxLength = 1000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

const SEGMENT_RULES = {
  '老板/公司': {
    keywords: ['老板', '公司', '投资', '预算', '进入', '落地', '渠道', '工厂', '本地对接', '市场进入'],
    recommendedOffer: '市场进入诊断 / 本地资源对接 / 老板级落地陪跑'
  },
  '小团队': {
    keywords: ['团队', '项目', '月', '监控', '作战台', '协同', '线索池', '持续监控', '定制情报'],
    recommendedOffer: '定制情报监控 / 小团队作战台 / 月陪跑'
  },
  '个人用户': {
    keywords: ['试水', '兼职', '个人', '副业', '自己做', '轻量'],
    recommendedOffer: '周机会包 / 行业包 / 机会诊断会'
  }
};

export function inferCustomerSegment(payload = {}) {
  const joined = [payload.company, payload.demand, payload.budget, payload.notes]
    .map((item) => normalizeText(item, 500).toLowerCase())
    .join(' ');

  const hasBossSignal = SEGMENT_RULES['老板/公司'].keywords.some((keyword) => joined.includes(keyword));
  const hasTeamSignal = SEGMENT_RULES['小团队'].keywords.some((keyword) => joined.includes(keyword));
  const hasPersonalSignal = SEGMENT_RULES['个人用户'].keywords.some((keyword) => joined.includes(keyword));

  if (hasBossSignal && !hasTeamSignal) {
    return '老板/公司';
  }

  if (hasTeamSignal) {
    return '小团队';
  }

  if (hasBossSignal) {
    return '老板/公司';
  }

  if (hasPersonalSignal) {
    return '个人用户';
  }

  return '个人用户';
}

export function recommendOffer(segment) {
  return SEGMENT_RULES[segment]?.recommendedOffer || SEGMENT_RULES['个人用户'].recommendedOffer;
}

export function scoreLead(payload = {}) {
  const segment = inferCustomerSegment(payload);
  return {
    segment,
    recommendedOffer: recommendOffer(segment)
  };
}
