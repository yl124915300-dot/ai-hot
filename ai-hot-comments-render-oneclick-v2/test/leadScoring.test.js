import test from 'node:test';
import assert from 'node:assert/strict';
import { inferCustomerSegment, recommendOffer, scoreLead } from '../src/lib/leadScoring.js';

test('inferCustomerSegment returns personal for light trial users', () => {
  const segment = inferCustomerSegment({
    demand: '我想自己先轻量试水，看看有没有副业机会',
    budget: '500'
  });

  assert.equal(segment, '个人用户');
});

test('inferCustomerSegment returns small team when continuous monitoring signals appear', () => {
  const segment = inferCustomerSegment({
    company: '跨境项目组',
    demand: '我们团队需要持续监控建材线索，每月更新优先级',
    budget: '3000/月'
  });

  assert.equal(segment, '小团队');
});

test('inferCustomerSegment returns boss/company for market-entry style leads', () => {
  const segment = inferCustomerSegment({
    company: '某制造公司',
    demand: '老板想评估进入乌兹市场，后面可能要本地对接',
    budget: '20000'
  });

  assert.equal(segment, '老板/公司');
});

test('recommendOffer matches each segment', () => {
  assert.match(recommendOffer('个人用户'), /机会诊断会/);
  assert.match(recommendOffer('小团队'), /定制情报监控/);
  assert.match(recommendOffer('老板/公司'), /市场进入诊断/);
});

test('scoreLead returns segment and recommended offer together', () => {
  const scored = scoreLead({
    demand: '我们团队想做定制情报监控和线索池',
    company: '项目团队'
  });

  assert.deepEqual(scored, {
    segment: '小团队',
    recommendedOffer: '定制情报监控 / 小团队作战台 / 月陪跑'
  });
});
