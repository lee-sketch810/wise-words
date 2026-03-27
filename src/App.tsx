/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, Quote as QuoteIcon, Sparkles, Loader2, Share2, Check, Copy, Search, Smile, Heart, Brain, Zap, Sun, Ghost, Cloud, Target } from "lucide-react";

interface Quote {
  text: string;
  author: string;
  category: string;
}

// Removed global ai instance to initialize inside function
const FALLBACK_QUOTES: Record<'ai' | 'famous', Quote[]> = {
  ai: [
    { text: "가장 깊은 고독 속에서 우리는 비로소 타인과 연결될 준비를 한다.", author: "", category: "고독" },
    { text: "실패는 마침표가 아니라, 문장을 더 풍성하게 만드는 쉼표일 뿐이다.", author: "", category: "실패" },
    { text: "도시의 소음은 우리가 듣지 못하는 내면의 목소리를 덮어버린다.", author: "", category: "도시" },
    { text: "기술이 우리를 연결할수록, 우리는 서로의 눈을 바라보는 법을 잊어간다.", author: "", category: "기술" },
    { text: "진정한 여행은 새로운 풍경을 보는 것이 아니라 새로운 눈을 가지는 것이다.", author: "", category: "성찰" },
    { text: "우리는 타인의 시선이라는 감옥 속에서 스스로를 가두고 살아간다.", author: "", category: "자아" },
    { text: "침묵은 아무것도 말하지 않는 것이 아니라, 가장 중요한 것을 말하기 위한 준비다.", author: "", category: "침묵" },
    { text: "행복은 목적지가 아니라, 그 목적지로 가는 길 위에 핀 이름 없는 들꽃이다.", author: "", category: "행복" }
  ],
  famous: [
    { text: "완벽함이란 더 이상 보탤 것이 없을 때가 아니라, 더 이상 뺄 것이 없을 때 완성된다.", author: "생텍쥐페리", category: "완벽" },
    { text: "어제와 똑같이 살면서 다른 미래를 기대하는 것은 정신병 초기 증세이다.", author: "알베르트 아인슈타인", category: "변화" },
    { text: "지옥을 걷고 있다면, 계속해서 걸어가라.", author: "윈스턴 처칠", category: "인내" },
    { text: "가장 큰 위험은 위험을 아무것도 감수하지 않는 것이다.", author: "마크 저커버그", category: "도전" },
    { text: "우리는 우리가 반복적으로 하는 행동의 결과물이다. 탁월함은 행동이 아니라 습관이다.", author: "아리스토텔레스", category: "습관" },
    { text: "내일 죽을 것처럼 살고, 영원히 살 것처럼 배워라.", author: "마하트마 간디", category: "배움" },
    { text: "승리는 가장 끈기 있는 자에게 돌아간다.", author: "나폴레옹 보나파르트", category: "승리" },
    { text: "성공은 최종적인 것이 아니며, 실패는 치명적인 것이 아니다. 중요한 것은 계속하는 용기다.", author: "윈스턴 처칠", category: "용기" }
  ]
};

const MOODS = [
  { id: '감동적인', label: '감동적인', icon: Heart },
  { id: '재미있는', label: '재미있는', icon: Smile },
  { id: '철학적인', label: '철학적인', icon: Brain },
  { id: '냉철한', label: '냉철한', icon: Zap },
  { id: '희망적인', label: '희망적인', icon: Sun },
  { id: '시니컬한', label: '시니컬한', icon: Ghost },
  { id: '몽글몽글한', label: '몽글몽글한', icon: Cloud },
  { id: '현실적인', label: '현실적인', icon: Target },
];

export default function App() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [selectedMood, setSelectedMood] = useState('감동적인');
  const [speechStyle, setSpeechStyle] = useState<'formal' | 'informal'>('formal');
  const [lastType, setLastType] = useState<'ai' | 'famous'>('ai');
  const [cooldown, setCooldown] = useState(0);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  // Initialize from cache
  useEffect(() => {
    const cached = localStorage.getItem('last_quotes');
    if (cached) {
      try {
        setQuotes(JSON.parse(cached));
      } catch (e) {
        console.error("Failed to parse cached quotes", e);
      }
    }
  }, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown(prev => prev <= 1 ? 0 : prev - 1);
      }, 1000);
    }
    return () => {
      clearInterval(timer);
      if (cooldown === 0) setIsQuotaExceeded(false);
    };
  }, [cooldown]);

  const generateQuotes = async (type: 'ai' | 'famous' = lastType, retries = 5, delay = 5000) => {
    if (cooldown > 0 && retries === 5) return;
    
    setLastType(type);
    setIsLoading(true);
    setError(null);
    setIsFallback(false);
    
    // Only clear quotes on the first attempt to avoid flickering during retries
    if (retries === 5) {
      setQuotes([]);
    }
    
    try {
      const apiKey = process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const styleInstruction = speechStyle === 'informal' ? "반말(스레드체)로 친근하게" : "존댓말로 정중하게";
      const famousStyleInstruction = "존댓말로 정중하게"; 
      
      const prompt = type === 'famous' 
        ? `유명한 역사적 인물들의 ${selectedMood} 명언 5개를 한국어로 생성해줘. ${keyword ? `'${keyword}' 키워드와 관련된 내용이어야 해.` : ''} 문체는 ${famousStyleInstruction} 작성해줘. 이전에 나왔던 것과 중복되지 않는 새로운 명언들이어야 해. 잘 알려지지 않은 인물이나 독특한 관점의 명언도 포함해서 다양하게 구성해줘. 반드시 실제 저자의 이름을 정확히 병기해야 해. JSON 배열 형식으로 반환해.`
        : `현대인들이 깊이 공감할 수 있고, 무릎을 탁 치게 만드는 통찰력 있는 ${selectedMood} 새로운 명언 5개를 한국어로 생성해줘. ${keyword ? `'${keyword}' 키워드와 관련된 내용이어야 해.` : ''} 문체는 ${styleInstruction} 작성해줘. 너무 무겁거나 진지하기만 한 톤보다는, 일상의 미묘한 진실이나 인간관계를 위트 있고 가볍게 꿰뚫는 날카로운 통찰을 담아줘. 뻔한 교훈은 피하고, 매번 다른 주제를 다루어 내용이 다양하게 구성해줘. 저자 이름(author)은 반드시 빈 문자열('')로 설정해줘. 짧은 카테고리를 포함해서 JSON 배열 형식으로 반환해.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "명언 내용 (한국어)" },
                author: { type: Type.STRING, description: "저자 이름 (유명인의 경우 실명)" },
                category: { type: Type.STRING, description: "명언의 카테고리 (한 단어)" }
              },
              required: ["text", "author", "category"]
            }
          }
        }
      });

      const result = JSON.parse(response.text || "[]");
      if (result.length === 0) throw new Error("Empty response from AI");
      
      setQuotes(result);
      localStorage.setItem('last_quotes', JSON.stringify(result));
      setCooldown(10); // Increased cooldown to 10s
      setIsQuotaExceeded(false);

    } catch (err: any) {
      console.error("Failed to generate quotes:", err);
      
      const errStr = JSON.stringify(err).toLowerCase();
      const isRateLimit = err?.status === 429 || 
                         err?.error?.code === 429 ||
                         err?.message?.includes('429') || 
                         err?.message?.includes('RESOURCE_EXHAUSTED') ||
                         err?.message?.includes('quota') ||
                         errStr.includes('429') ||
                         errStr.includes('resource_exhausted') ||
                         errStr.includes('quota');

      if (isRateLimit) {
        setIsQuotaExceeded(true);
        if (retries > 0) {
          console.log(`Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return generateQuotes(type, retries - 1, delay * 2);
        }
        
        // Try to load from cache if API fails completely
        const cached = localStorage.getItem('last_quotes');
        if (cached) {
          try {
            setQuotes(JSON.parse(cached));
            setIsFallback(true);
            setError("Gemini API 할당량이 초과되어 이전에 보셨던 명언들을 보여드립니다. 잠시 후 다시 시도해주세요.");
            return;
          } catch (e) {}
        }

        const shuffled = [...FALLBACK_QUOTES[type]].sort(() => 0.5 - Math.random());
        setQuotes(shuffled.slice(0, 5));
        setIsFallback(true);
        setError("Gemini API 할당량이 초과되었습니다. 무료 티어의 경우 요청 횟수가 제한될 수 있습니다. 잠시 후 다시 시도해주시거나, 준비된 예비 명언을 확인해주세요.");
      } else {
        setError("명언을 가져오는 중 오류가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = useCallback(async (quote: Quote) => {
    const shareText = quote.author ? `${quote.text} - ${quote.author}` : quote.text;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WiseWords 명언 공유',
          text: shareText,
        });
      } catch (err) {
        console.log('Error sharing:', err);
        // Fallback to clipboard if share fails or is cancelled
        copyToClipboard(shareText, quote.text);
      }
    } else {
      copyToClipboard(shareText, quote.text);
    }
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <header className="w-full max-w-4xl mb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-serif text-5xl md:text-7xl font-light tracking-tight mb-4">
            Wise<span className="italic font-medium">Words</span>
          </h1>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
            AI-Powered Inspiration • 5 Quotes at a Time
          </p>
        </motion.div>
      </header>

      <main className="w-full max-w-4xl flex-grow">
        <div className="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-gray-100 mb-8 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Keyword Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">키워드 (선택)</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 사랑, 성공, 실패..."
                  className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all text-sm"
                />
              </div>
            </div>

            {/* Mood Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">분위기</label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMood(m.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                      selectedMood === m.id 
                        ? 'bg-[#1a1a1a] text-white shadow-md' 
                        : 'bg-white text-gray-500 border border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <m.icon className={`w-3 h-3 ${selectedMood === m.id ? 'text-white' : 'text-gray-400'}`} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Speech Style Selection */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">말투</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSpeechStyle('formal')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                    speechStyle === 'formal' 
                      ? 'bg-gray-100 text-gray-900 border-2 border-gray-200' 
                      : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-200'
                  }`}
                >
                  정중한 존댓말
                </button>
                <button
                  onClick={() => setSpeechStyle('informal')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                    speechStyle === 'informal' 
                      ? 'bg-purple-50 text-purple-700 border-2 border-purple-100' 
                      : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-200'
                  }`}
                >
                  스레드용 반말체
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-4 mb-12">
          <button
            onClick={() => generateQuotes('famous')}
            disabled={isLoading || cooldown > 0}
            className="group relative flex items-center gap-2 px-8 py-4 bg-white text-[#1a1a1a] border border-gray-200 rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-sm"
          >
            <QuoteIcon className="w-5 h-5 text-gray-400" />
            <span className="font-medium tracking-wide">
              {cooldown > 0 ? `${cooldown}초 후 가능` : '유명인 명언 가져오기'}
            </span>
          </button>

          <button
            onClick={() => generateQuotes('ai')}
            disabled={isLoading || cooldown > 0}
            className="group relative flex items-center gap-2 px-8 py-4 bg-[#1a1a1a] text-white rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <span className="font-medium tracking-wide">
              {cooldown > 0 ? `${cooldown}초 후 가능` : 'AI 명언 제조하기'}
            </span>
          </button>
        </div>

        {error && (
          <div className={`text-center p-6 rounded-2xl mb-8 border flex flex-col items-center gap-4 ${isFallback ? 'bg-amber-50 text-amber-700 border-amber-100 shadow-inner' : 'bg-red-50 text-red-600 border-red-100'}`}>
            <div className="flex items-center gap-2 font-bold">
              {isFallback ? <Sparkles className="w-5 h-5 text-amber-500" /> : <Zap className="w-5 h-5 text-red-500" />}
              <span>{isFallback ? (isQuotaExceeded ? 'API 할당량 초과' : '예비 명언 모드') : '오류 발생'}</span>
            </div>
            <p className="text-sm leading-relaxed max-w-lg">{error}</p>
            {!isFallback && (
              <button
                onClick={() => generateQuotes()}
                className="flex items-center gap-2 px-6 py-2.5 bg-white border border-red-200 rounded-xl text-sm font-bold hover:bg-red-100 transition-all shadow-sm active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                다시 시도
              </button>
            )}
            {isQuotaExceeded && (
              <div className="flex flex-col items-center gap-2">
                <a 
                  href="https://ai.google.dev/gemini-api/docs/rate-limits" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-amber-600 underline hover:text-amber-800 transition-colors"
                >
                  Gemini API 할당량 정책 확인하기
                </a>
                <p className="text-[10px] text-amber-500 opacity-70">무료 티어는 분당 요청 횟수가 제한되어 있습니다.</p>
              </div>
            )}
          </div>
        )}

        {!isLoading && quotes.length === 0 && !error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-32 text-center"
          >
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-8">
              <Sparkles className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="font-serif text-3xl text-gray-800 mb-4">오늘의 영감을 선택하세요</h2>
            <p className="text-gray-500 max-w-md leading-relaxed px-4">
              위의 버튼을 눌러 유명인의 지혜나 AI가 제안하는 새로운 통찰을 만나보세요.
            </p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {quotes.map((quote, index) => (
              <motion.div
                key={quote.text + index}
                layout
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                transition={{ 
                  duration: 0.4, 
                  delay: index * 0.05,
                  type: "spring",
                  stiffness: 100
                }}
                className="group bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 transition-all flex flex-col justify-between min-h-[260px] relative"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <QuoteIcon className="w-8 h-8 text-gray-200 group-hover:text-gray-400 transition-colors" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded">
                        {quote.category}
                      </span>
                      <button
                        onClick={() => handleShare(quote)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                        title="공유하기"
                      >
                        {copiedId === quote.text ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Share2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="font-serif text-xl md:text-2xl leading-relaxed text-gray-800 mb-6">
                    {quote.text}
                  </p>
                </div>
                {quote.author && (
                  <div className="flex items-center gap-3">
                    <div className="h-[1px] w-8 bg-gray-200" />
                    <span className="text-sm font-medium text-gray-500 italic">
                      {quote.author}
                    </span>
                  </div>
                )}

                {/* Toast-like feedback */}
                <AnimatePresence>
                  {copiedId === quote.text && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-4 right-8 bg-green-500 text-white text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-tighter"
                    >
                      Copied!
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {isLoading && quotes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 opacity-50">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p className="font-serif italic text-xl">지혜를 모으는 중입니다...</p>
          </div>
        )}
      </main>

      <footer className="w-full max-w-4xl mt-24 pt-8 border-t border-gray-100 text-center text-gray-400 text-xs tracking-widest uppercase">
        <p>© 2026 WiseWords AI • Powered by Gemini</p>
      </footer>
    </div>
  );
}
