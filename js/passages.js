/* 内置朗读短文：按难度分级，刻意包含连读、弱读、重音等典型口语现象 */
(function (root) {
  'use strict';

  var PASSAGES = [
    {
      title: '清晨的咖啡店',
      level: '初级',
      topic: '日常生活',
      text: "Good morning! I'd like a cup of coffee, please. Make it a large one, with a little bit of milk. I come here almost every day before work. The barista already knows my order, so I usually just smile and say the usual, please."
    },
    {
      title: '自我介绍',
      level: '初级',
      topic: '社交',
      text: "Hi, it's nice to meet you. My name is Li Ming, and I'm from Beijing. I work as a software engineer at a small company. In my free time, I like reading and playing basketball. What about you? What do you do for a living?"
    },
    {
      title: '机场转机',
      level: '中级',
      topic: '旅行',
      text: "Excuse me, could you tell me where the transfer desk is? My connecting flight leaves in about an hour, and I'm afraid I might miss it. The screen says the gate has been changed, but I can't find gate B twenty-two anywhere. Is there a shuttle bus to the other terminal?"
    },
    {
      title: '手机与生活',
      level: '中级',
      topic: '科技观点',
      text: "I think smartphones have changed the way we live, for better or for worse. On the one hand, we can talk to anyone in the world at any time. On the other hand, a lot of us spend hours scrolling through short videos instead of talking to the people right in front of us. Honestly, I'm trying to cut down on my screen time."
    },
    {
      title: '面试自我推销',
      level: '高级',
      topic: '职场',
      text: "Thank you for having me today. Over the past five years, I've led a team of eight engineers, and we've shipped products used by more than two million people. What I bring to the table isn't just technical expertise; it's the ability to turn a vague idea into something concrete, on time and on budget. I'd love to do the same for your team."
    }
  ];

  root.Passages = { list: PASSAGES };
})(typeof window !== 'undefined' ? window : globalThis);
