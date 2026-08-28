'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';
import { Icon } from '@/app/components/Icon';

// ─── Question Bank ──────────────────────────────────────────
interface Question {
  id: number;
  category: string;
  question: string;
  options: string[];
  correct: number; // index
  difficulty: 'easy' | 'medium' | 'hard';
  coinReward: number;
}

const allQuestions: Question[] = [
  // ── Campus Knowledge ──
  { id: 1, category: '🏫 Campus', question: 'What does DWCL stand for?', options: ['Divine Word College of Legazpi', 'Department of Worship and Campus Life', 'Development Works in Community Learning', 'Dynamic World of Creative Learning'], correct: 0, difficulty: 'easy', coinReward: 3 },
  { id: 2, category: '🏫 Campus', question: 'What type of institution is DWCL?', options: ['A public university', 'A Catholic college run by the Divine Word missionaries', 'A private tech school', 'A government training center'], correct: 1, difficulty: 'easy', coinReward: 3 },
  { id: 3, category: '🏫 Campus', question: 'In which city is DWCL located?', options: ['Naga City', 'Tabaco City', 'Legazpi City', 'Sorsogon City'], correct: 2, difficulty: 'easy', coinReward: 3 },
  { id: 4, category: '🏫 Campus', question: 'DWCL is part of which larger university system?', options: ['Ateneo de Naga University System', 'University of Santo Tomas', 'Divine Word University System', 'Bicol University System'], correct: 2, difficulty: 'medium', coinReward: 5 },
  { id: 5, category: '🏫 Campus', question: 'Which famous volcano is visible from Legazpi City?', options: ['Mount Mayon', 'Mount Apo', 'Mount Pinatubo', 'Mount Taal'], correct: 0, difficulty: 'easy', coinReward: 3 },

  // ── Bicol Culture ──
  { id: 6, category: '🌶️ Bicol', question: 'What is Bicol known as the "spice capital" of the Philippines for?', options: ['Its abundance of black pepper', 'Its love for chili peppers (siling labuyo)', 'Its cinnamon production', 'Its ginger farms'], correct: 1, difficulty: 'easy', coinReward: 3 },
  { id: 7, category: '🌶️ Bicol', question: 'What is the traditional Bicolano dish made with coconut milk and chili?', options: ['Adobo', 'Bicol Express', 'Sinigang', 'Kare-Kare'], correct: 1, difficulty: 'easy', coinReward: 3 },
  { id: 8, category: '🌶️ Bicol', question: 'What is "laing" made from?', options: ['Taro leaves cooked in coconut milk', 'Dried fish and tomatoes', 'Rice wrapped in banana leaves', 'Grilled pork belly'], correct: 0, difficulty: 'medium', coinReward: 5 },
  { id: 9, category: '🌶️ Bicol', question: 'What is the Bicolano word for "thank you" in the local dialect?', options: ['Salamat', 'Dios mabalos', 'Maraming salamat', 'Salamat po'], correct: 1, difficulty: 'hard', coinReward: 8 },
  { id: 10, category: '🌶️ Bicol', question: 'Which province in Bicol is known for its whale shark (butanding) interaction?', options: ['Albay', 'Camarines Sur', 'Sorsogon', 'Camarines Norte'], correct: 2, difficulty: 'medium', coinReward: 5 },

  // ── Food & Snacks ──
  { id: 11, category: '🍕 Food', question: 'What is musubi primarily made of?', options: ['Bread and butter', 'Rice, meat, and nori seaweed', 'Pasta and cheese', 'Tortilla and beans'], correct: 1, difficulty: 'easy', coinReward: 3 },
  { id: 12, category: '🍕 Food', question: 'What gives churros their classic ridged shape?', options: ['Being rolled by hand', 'Being piped through a star-shaped nozzle', 'Being cut with special scissors', 'Being pressed in a mold'], correct: 1, difficulty: 'medium', coinReward: 5 },
  { id: 13, category: '🍕 Food', question: 'What is coffee jelly primarily made of?', options: ['Coffee-flavored gelatin with cream', 'Frozen coffee ice cream', 'Coffee beans and sugar', 'Espresso and milk foam'], correct: 0, difficulty: 'easy', coinReward: 3 },
  { id: 14, category: '🍕 Food', question: 'What is the main ingredient in a classic Filipino ensaymada?', options: ['Rice flour', 'Enriched bread dough with butter and cheese', 'Corn meal', 'Cassava'], correct: 1, difficulty: 'medium', coinReward: 5 },
  { id: 15, category: '🍕 Food', question: 'What does "bento" mean in Japanese?', options: ['Delicious meal', 'Packed lunch box', 'Rice ball', 'Street food'], correct: 1, difficulty: 'easy', coinReward: 3 },

  // ── Mario & Gaming ──
  { id: 16, category: '🍄 Mario', question: 'What is the name of Mario\'s brother?', options: ['Wario', 'Luigi', 'Toad', 'Yoshi'], correct: 1, difficulty: 'easy', coinReward: 3 },
  { id: 17, category: '🍄 Mario', question: 'What does a Super Star do in Mario games?', options: ['Makes Mario invincible temporarily', 'Gives extra lives', 'Opens secret doors', 'Transforms Mario'], correct: 0, difficulty: 'easy', coinReward: 3 },
  { id: 18, category: '🍄 Mario', question: 'What is the name of the princess Mario always rescues?', options: ['Princess Daisy', 'Princess Peach', 'Princess Rosalina', 'Princess Zelda'], correct: 1, difficulty: 'easy', coinReward: 3 },
  { id: 19, category: '🍄 Mario', question: 'What power-up makes Mario grow bigger?', options: ['Super Star', 'Fire Flower', 'Super Mushroom', '1-Up Mushroom'], correct: 2, difficulty: 'easy', coinReward: 3 },
  { id: 20, category: '🍄 Mario', question: 'In which year was the original Super Mario Bros. released?', options: ['1983', '1985', '1987', '1990'], correct: 1, difficulty: 'hard', coinReward: 8 },

  // ── General Knowledge ──
  { id: 21, category: '🧠 General', question: 'What is the currency of the Philippines?', options: ['Dollar', 'Peso', 'Yuan', 'Euro'], correct: 1, difficulty: 'easy', coinReward: 3 },
  { id: 22, category: '🧠 General', question: 'How many provinces are in the Bicol Region?', options: ['4', '5', '6', '7'], correct: 2, difficulty: 'medium', coinReward: 5 },
  { id: 23, category: '🧠 General', question: 'What is the largest island in the Philippines?', options: ['Mindanao', 'Visayas', 'Luzon', 'Palawan'], correct: 2, difficulty: 'easy', coinReward: 3 },
  { id: 24, category: '🧠 General', question: 'What year did the Philippines gain independence?', options: ['1896', '1898', '1946', '1986'], correct: 2, difficulty: 'medium', coinReward: 5 },
  { id: 25, category: '🧠 General', question: 'What is the national bird of the Philippines?', options: ['Eagle', 'Maya bird', 'Parrot', 'Dove'], correct: 0, difficulty: 'medium', coinReward: 5 },
];

// ─── Game Types ──────────────────────────────────────────────
type GamePhase = 'menu' | 'playing' | 'feedback' | 'gameover' | 'complete';

const QUESTION_TIME = 10; // seconds per question (was 15)
const QUESTION_TIME_LEGENDARY = 8; // legendary mode: 8 seconds
const MAX_LIVES = 2; // was 3
const MAX_LIVES_LEGENDARY = 1; // legendary mode: 1 life
const STREAK_BONUS = 3; // extra coins per streak (was 5)
const MAX_PLAYS_PER_DAY = 2;
const TRIVIA_PLAYS_KEY = 'muragoods_trivia_plays';

// Coin rewards are now smaller per question
// easy: 3, medium: 5, hard: 8 (was 5/10/15)

export default function TriviaPage() {
  const router = useRouter();
  const { addCoins } = useCoins();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [timer, setTimer] = useState(QUESTION_TIME);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalWrong, setTotalWrong] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [highScore, setHighScore] = useState(0);
  const [playsToday, setPlaysToday] = useState(0);
  const [playsLeft, setPlaysLeft] = useState(MAX_PLAYS_PER_DAY);
  const [isLegendaryMode, setIsLegendaryMode] = useState(false);
  const [legendaryHighScore, setLegendaryHighScore] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);
    const saved = parseInt(localStorage.getItem('muragoods_trivia_highscore') || '0', 10);
    setHighScore(saved);
    const savedLegHS = parseInt(localStorage.getItem('muragoods_trivia_legendary_hs') || '0', 10);
    setLegendaryHighScore(savedLegHS);

    // Load daily plays
    try {
      const playsData = JSON.parse(localStorage.getItem(TRIVIA_PLAYS_KEY) || '{}');
      const today = new Date().toISOString().split('T')[0];
      if (playsData.date === today) {
        setPlaysToday(playsData.count || 0);
        setPlaysLeft(Math.max(0, MAX_PLAYS_PER_DAY - (playsData.count || 0)));
      } else {
        // New day, reset
        localStorage.setItem(TRIVIA_PLAYS_KEY, JSON.stringify({ date: today, count: 0 }));
        setPlaysToday(0);
        setPlaysLeft(MAX_PLAYS_PER_DAY);
      }
    } catch {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(TRIVIA_PLAYS_KEY, JSON.stringify({ date: today, count: 0 }));
    }
  }, [router]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const qTime = isLegendaryMode ? QUESTION_TIME_LEGENDARY : QUESTION_TIME;
    setTimer(qTime);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          // Time's up — treat as wrong
          handleAnswer(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentIndex]);

  const startGame = useCallback((legendary = false) => {
    // Check daily play limit
    if (playsLeft <= 0) {
      alert('You\'ve used all 2 plays for today! Come back tomorrow.');
      return;
    }

    setIsLegendaryMode(legendary);
    let pool = [...allQuestions];
    if (selectedCategory !== 'all') {
      pool = pool.filter(q => q.category === selectedCategory);
    }
    // Legendary mode: only hard questions
    if (legendary) {
      pool = pool.filter(q => q.difficulty === 'hard' || q.difficulty === 'medium');
    }
    // Shuffle and pick 10
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 10);
    setQuestions(shuffled);
    setCurrentIndex(0);
    setLives(legendary ? MAX_LIVES_LEGENDARY : MAX_LIVES);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCoinsEarned(0);
    setTotalCorrect(0);
    setTotalWrong(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setPhase('playing');

    // Increment plays counter
    const today = new Date().toISOString().split('T')[0];
    const newCount = playsToday + 1;
    setPlaysToday(newCount);
    setPlaysLeft(Math.max(0, MAX_PLAYS_PER_DAY - newCount));
    localStorage.setItem(TRIVIA_PLAYS_KEY, JSON.stringify({ date: today, count: newCount }));
  }, [selectedCategory, playsToday, playsLeft]);

  const handleAnswer = useCallback((answerIndex: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (phase !== 'playing') return;

    const q = questions[currentIndex];
    if (!q) return;

    const correct = answerIndex === q.correct || answerIndex === -1;
    setSelectedAnswer(answerIndex);
    setIsCorrect(correct);

    if (correct) {
      const timeBonus = timer > 8 ? 3 : timer > 4 ? 2 : 0;
      const streakBonus = streak >= 2 ? STREAK_BONUS * Math.min(streak - 1, 5) : 0;
      const legendaryMultiplier = isLegendaryMode ? 3 : 1;
      const total = (q.coinReward + timeBonus + streakBonus) * legendaryMultiplier;
      setScore(prev => prev + total);
      setCoinsEarned(prev => prev + total);
      setStreak(prev => {
        const next = prev + 1;
        setBestStreak(b => Math.max(b, next));
        return next;
      });
      setTotalCorrect(prev => prev + 1);
    } else {
      setLives(prev => prev - 1);
      setStreak(0);
      setTotalWrong(prev => prev + 1);
    }

    setPhase('feedback');

    // After feedback, move to next or game over
    setTimeout(() => {
      if (!correct && lives <= 1) {
        // Game over
        const finalScore = score + (correct ? q.coinReward : 0);
        if (finalScore > highScore) {
          setHighScore(finalScore);
          localStorage.setItem('muragoods_trivia_highscore', String(finalScore));
        }
        if (isLegendaryMode && finalScore > legendaryHighScore) {
          setLegendaryHighScore(finalScore);
          localStorage.setItem('muragoods_trivia_legendary_hs', String(finalScore));
        }
        if (coinsEarned > 0) addCoins(coinsEarned, isLegendaryMode ? 'Legendary Mode — Game Over' : 'Trivia Challenge — Game Over');
        setPhase('gameover');
      } else if (currentIndex >= questions.length - 1) {
        // Completed all questions
        if (coinsEarned > 0) addCoins(coinsEarned, isLegendaryMode ? 'Legendary Mode — Quest Complete' : 'Trivia Challenge — Quest Complete');
        const finalScore = score;
        if (finalScore > highScore) {
          setHighScore(finalScore);
          localStorage.setItem('muragoods_trivia_highscore', String(finalScore));
        }
        if (isLegendaryMode && finalScore > legendaryHighScore) {
          setLegendaryHighScore(finalScore);
          localStorage.setItem('muragoods_trivia_legendary_hs', String(finalScore));
        }
        setPhase('complete');
      } else {
        setCurrentIndex(prev => prev + 1);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setPhase('playing');
      }
    }, 2000);
  }, [phase, questions, currentIndex, timer, streak, lives, score, coinsEarned, highScore, addCoins]);

  if (!isLoggedIn) return null;

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const categories = ['all', ...new Set(allQuestions.map(q => q.category))];

  // ─── MENU ───────────────────────────────────────────────
  if (phase === 'menu') {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Trivia Challenge" />
        <section className="px-4 py-10 sm:px-8">
          <div className="deco-container" style={{ maxWidth: '48rem' }}>
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
                🧠 Trivia Challenge
              </h1>
              <p className="mt-3 text-base text-[var(--gold)]">Test your knowledge and earn coins!</p>
            </div>

            {/* High Scores */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {highScore > 0 && (
                <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] p-4 rounded-2xl text-center">
                  <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Normal High Score</p>
                  <p className="coin-price text-lg mt-1">{highScore} 🪙</p>
                </div>
              )}
              {legendaryHighScore > 0 && (
                <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 rounded-2xl text-center">
                  <p className="text-[8px] text-[var(--crimson)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>🏆 Legendary High Score</p>
                  <p className="text-lg mt-1" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--crimson)' }}>{legendaryHighScore} 🪙</p>
                </div>
              )}
            </div>

            {/* How It Works */}
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 mb-6">
              <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>How It Works</h2>
              <div className="space-y-3">
                {[
                  { icon: '❤️', text: `Normal: ${MAX_LIVES} lives · Legendary: ${MAX_LIVES_LEGENDARY} life` },
                  { icon: '⏱️', text: `Normal: ${QUESTION_TIME}s per question · Legendary: ${QUESTION_TIME_LEGENDARY}s` },
                  { icon: '🔥', text: 'Build streaks for bonus coins (2+ correct in a row)' },
                  { icon: <Icon name="coin" size={20} />, text: 'Normal: 3-8 coins/question · Legendary: 3x multiplier!' },
                  { icon: '💀', text: 'Legendary mode: only hard questions, 1 life, 8s timer' },
                ].map(item => (
                  <div key={item.text} className="flex items-center gap-3">
                    <span className="text-lg">{item.icon}</span>
                    <p className="text-sm text-[var(--cream-muted)]">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Selection */}
            <div className="mb-6">
              <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-3 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>Choose Category</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 border-2 rounded-xl text-[9px] uppercase transition-all ${selectedCategory === cat ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--obsidian)]' : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] text-[var(--cream-muted)] hover:border-[var(--gold)]'}`}
                    style={{ fontFamily: 'var(--font-arcade)' }}
                  >
                    {cat === 'all' ? '🎯 All' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily Plays */}
            <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] p-4 rounded-2xl text-center mb-6">
              <p className="text-[9px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Daily Plays</p>
              <div className="flex justify-center gap-2 mt-2">
                {Array.from({ length: MAX_PLAYS_PER_DAY }).map((_, i) => (
                  <span key={i} className="text-xl" style={{ opacity: i < playsLeft ? 1 : 0.3 }}>
                    {i < playsLeft ? '🎮' : '🚫'}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-[var(--cream-muted)] mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                {playsLeft > 0 ? `${playsLeft} play${playsLeft !== 1 ? 's' : ''} remaining today` : 'No plays left today!'}
              </p>
            </div>

            {/* Start Buttons */}
            <div className="space-y-3">
              <div className="text-center">
                <button
                  onClick={() => startGame(false)}
                  disabled={playsLeft <= 0}
                  className="deco-btn deco-btn-gold deco-btn-lg rounded-2xl pulse-glow disabled:opacity-40 disabled:cursor-not-allowed w-full"
                  style={{ fontFamily: 'var(--font-arcade)', maxWidth: '320px' }}
                >
                  🎮 {playsLeft > 0 ? 'START NORMAL GAME' : 'NO PLAYS LEFT'}
                </button>
                <p className="text-[9px] text-[var(--pewter)] mt-2">{MAX_LIVES} lives · {QUESTION_TIME}s timer · 1x coins</p>
              </div>
              <div className="text-center">
                <button
                  onClick={() => startGame(true)}
                  disabled={playsLeft <= 0}
                  className="deco-btn deco-btn-crimson deco-btn-lg rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed w-full"
                  style={{ fontFamily: 'var(--font-arcade)', maxWidth: '320px', boxShadow: '0 0 20px rgba(229,37,33,0.3)' }}
                >
                  💀 {playsLeft > 0 ? 'LEGENDARY MODE' : 'NO PLAYS LEFT'}
                </button>
                <p className="text-[9px] text-[var(--crimson)] mt-2">{MAX_LIVES_LEGENDARY} life · {QUESTION_TIME_LEGENDARY}s timer · 3x coins · HARD ONLY</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ─── GAME OVER ──────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Game Over" />
        <section className="px-4 py-10 sm:px-8">
          <div className="deco-container" style={{ maxWidth: '40rem' }}>
            <div className="deco-modal bounce-in rounded-2xl max-w-md mx-auto" style={{ background: 'var(--charcoal)' }}>
              <div className="deco-modal-header text-center rounded-t-2xl" style={{ background: 'linear-gradient(135deg, var(--crimson-dark), var(--crimson))' }}>
                <h2 className="text-sm text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>💀 GAME OVER</h2>
              </div>
              <div className="deco-modal-body text-center space-y-4">
                <div className="text-5xl">😵</div>
                <p className="text-[10px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>OUT OF LIVES!</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Score</p>
                    <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{score}</p>
                  </div>
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Coins</p>
                    <p className="text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>+{coinsEarned}</p>
                  </div>
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Correct</p>
                    <p className="text-sm text-[var(--emerald-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{totalCorrect}</p>
                  </div>
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Best Streak</p>
                    <p className="text-sm text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>{bestStreak}🔥</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => startGame(isLegendaryMode)} className="deco-btn deco-btn-gold flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    🔄 TRY AGAIN
                  </button>
                  <Link href="/" className="deco-btn flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    ← MENU
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ─── COMPLETE ───────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Victory!" />
        <section className="px-4 py-10 sm:px-8">
          <div className="deco-container" style={{ maxWidth: '40rem' }}>
            <div className="deco-modal bounce-in rounded-2xl max-w-md mx-auto" style={{ background: 'var(--charcoal)' }}>
              <div className="deco-modal-header text-center rounded-t-2xl" style={{ background: 'linear-gradient(135deg, var(--emerald-dark), var(--emerald-bright))' }}>
                <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>🎉 QUEST COMPLETE!</h2>
              </div>
              <div className="deco-modal-body text-center space-y-4">
                <div className="text-5xl">🏆</div>
                <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>ALL QUESTIONS ANSWERED!</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Final Score</p>
                    <p className="text-lg text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{score}</p>
                  </div>
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Coins Earned</p>
                    <p className="text-lg text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>🪙 +{coinsEarned}</p>
                  </div>
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Accuracy</p>
                    <p className="text-lg text-[var(--emerald-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{totalCorrect}/{totalCorrect + totalWrong}</p>
                  </div>
                  <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                    <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Best Streak</p>
                    <p className="text-lg text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>{bestStreak}🔥</p>
                  </div>
                </div>
                {score >= highScore && score > 0 && (
                  <p className="text-[10px] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>⭐ NEW HIGH SCORE! ⭐</p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => startGame(isLegendaryMode)} className="deco-btn deco-btn-gold flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    🔄 PLAY AGAIN
                  </button>
                  <Link href="/" className="deco-btn flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    ← MENU
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ─── PLAYING / FEEDBACK ────────────────────────────────
  if (!currentQuestion) return null;
  const isFeedback = phase === 'feedback';
  const maxTime = isLegendaryMode ? QUESTION_TIME_LEGENDARY : QUESTION_TIME;
  const timerPercent = (timer / maxTime) * 100;
  const timerColor = timer > maxTime * 0.6 ? 'var(--emerald-bright)' : timer > maxTime * 0.3 ? 'var(--gold-bright)' : 'var(--crimson)';

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Trivia Challenge" />
      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>

          {/* HUD — Lives, Score, Streak, Timer */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            {/* Lives */}
            <div className="flex items-center gap-1">
              {Array.from({ length: MAX_LIVES }).map((_, i) => (
                <span key={i} className={`text-lg transition-all ${i < lives ? 'opacity-100' : 'opacity-20 grayscale'}`}>
                  {i < lives ? '❤️' : '🖤'}
                </span>
              ))}
            </div>

            {/* Score */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>SCORE</span>
              <span className="coin-price text-sm">{score}</span>
            </div>

            {/* Streak */}
            {streak >= 2 && (
              <div className="flex items-center gap-1 border border-[var(--crimson)] bg-[rgba(229,37,33,0.15)] px-3 py-1 rounded-xl">
                <span className="text-sm">🔥</span>
                <span className="text-[9px] text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>x{streak}</span>
              </div>
            )}

            {/* Coins earned */}
            <div className="flex items-center gap-1">
              <span className="text-sm">🪙</span>
              <span className="text-[9px] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>+{coinsEarned}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-[var(--charcoal-light)] rounded-full mb-6 overflow-hidden">
            <div className="h-full bg-[var(--gold)] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          {/* Timer */}
          <div className="w-full h-3 bg-[var(--charcoal-light)] rounded-full mb-6 overflow-hidden border border-[rgba(242,240,228,0.12)]">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${timerPercent}%`, background: timerColor }}
            />
          </div>

          {/* Question Card */}
          <div className={`border-2 rounded-2xl p-6 sm:p-8 mb-6 transition-all ${isFeedback ? (isCorrect ? 'border-[var(--emerald-bright)]' : 'border-[var(--crimson)]') : 'border-[var(--gold)]'} bg-[var(--charcoal)]`}>
            {/* Category & Difficulty */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                {currentQuestion.category}
              </span>
              <span className={`text-[8px] uppercase px-2 py-1 rounded-lg border ${
                currentQuestion.difficulty === 'easy' ? 'text-[var(--emerald-bright)] border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.2)]' :
                currentQuestion.difficulty === 'medium' ? 'text-[var(--gold-bright)] border-[var(--gold)] bg-[rgba(212,175,55,0.1)]' :
                'text-[var(--crimson)] border-[var(--crimson)] bg-[rgba(229,37,33,0.1)]'
              }`} style={{ fontFamily: 'var(--font-arcade)' }}>
                {currentQuestion.difficulty} +{currentQuestion.coinReward}
              </span>
            </div>

            {/* Question */}
            <h2 className="text-sm sm:text-base text-[var(--cream)] leading-relaxed" style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}>
              {currentQuestion.question}
            </h2>
          </div>

          {/* Answer Options */}
          <div className="grid gap-3 mb-6">
            {currentQuestion.options.map((option, i) => {
              const isSelected = selectedAnswer === i;
              const isCorrectOption = i === currentQuestion.correct;
              let optionStyle = 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] hover:border-[var(--gold)]';
              if (isFeedback) {
                if (isCorrectOption) {
                  optionStyle = 'border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.3)]';
                } else if (isSelected && !isCorrect) {
                  optionStyle = 'border-[var(--crimson)] bg-[rgba(229,37,33,0.15)]';
                } else {
                  optionStyle = 'border-[rgba(242,240,228,0.06)] bg-[var(--charcoal-light)] opacity-50';
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => !isFeedback && handleAnswer(i)}
                  disabled={isFeedback}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${optionStyle} ${isFeedback ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 flex items-center justify-center border border-[rgba(242,240,228,0.15)] rounded-lg text-[9px] shrink-0" style={{ fontFamily: 'var(--font-arcade)' }}>
                      {isFeedback && isCorrectOption ? '✓' : isFeedback && isSelected && !isCorrect ? '✖' : String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-sm text-[var(--cream-muted)]">{option}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Feedback Banner */}
          {isFeedback && (
            <div className={`border-2 rounded-2xl p-4 text-center mb-4 ${isCorrect ? 'border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.2)]' : 'border-[var(--crimson)] bg-[rgba(229,37,33,0.1)]'}`}>
              <p className="text-sm" style={{ fontFamily: 'var(--font-arcade)', color: isCorrect ? 'var(--emerald-bright)' : 'var(--crimson)' }}>
                {isCorrect ? '✅ CORRECT!' : selectedAnswer === -1 ? '⏱️ TIME\'S UP!' : '❌ WRONG!'}
              </p>
              {isCorrect && timer > 5 && (
                <p className="text-[9px] text-[var(--gold)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>
                  +{currentQuestion.coinReward} coins {timer > 10 ? '+ 5 speed bonus' : '+ 3 speed bonus'} {streak >= 2 ? `+ ${STREAK_BONUS} streak!` : ''}
                </p>
              )}
            </div>
          )}

          {/* Question Counter */}
          <div className="text-center">
            <p className="text-[9px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
              QUESTION {currentIndex + 1} / {questions.length}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
