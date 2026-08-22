'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

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
  { id: 1, category: '🏫 Campus', question: 'What does DWCL stand for?', options: ['DWCL stands for Divine Word College of Legazpi', 'DWCL stands for Department of Worship and Campus Life', 'DWCL stands for Development Works in Community Learning', 'DWCL stands for Dynamic World of Creative Learning'], correct: 0, difficulty: 'easy', coinReward: 5 },
  { id: 2, category: '🏫 Campus', question: 'What type of institution is DWCL?', options: ['A public university', 'A Catholic college run by the Divine Word missionaries', 'A private tech school', 'A government training center'], correct: 1, difficulty: 'easy', coinReward: 5 },
  { id: 3, category: '🏫 Campus', question: 'In which city is DWCL located?', options: ['Naga City', 'Tabaco City', 'Legazpi City', 'Sorsogon City'], correct: 2, difficulty: 'easy', coinReward: 5 },
  { id: 4, category: '🏫 Campus', question: 'DWCL is part of which larger university system?', options: ['Ateneo de Naga University System', 'University of Santo Tomas', 'Divine Word University System', 'Bicol University System'], correct: 2, difficulty: 'medium', coinReward: 10 },
  { id: 5, category: '🏫 Campus', question: 'Which famous volcano is visible from Legazpi City?', options: ['Mount Mayon', 'Mount Apo', 'Mount Pinatubo', 'Mount Taal'], correct: 0, difficulty: 'easy', coinReward: 5 },

  // ── Bicol Culture ──
  { id: 6, category: '🌶️ Bicol', question: 'What is Bicol known as the "spice capital" of the Philippines for?', options: ['Its abundance of black pepper', 'Its love for chili peppers (siling labuyo)', 'Its cinnamon production', 'Its ginger farms'], correct: 1, difficulty: 'easy', coinReward: 5 },
  { id: 7, category: '🌶️ Bicol', question: 'What is the traditional Bicolano dish made with coconut milk and chili?', options: ['Adobo', 'Bicol Express', 'Sinigang', 'Kare-Kare'], correct: 1, difficulty: 'easy', coinReward: 5 },
  { id: 8, category: '🌶️ Bicol', question: 'What is "laing" made from?', options: ['Taro leaves cooked in coconut milk', 'Dried fish and tomatoes', 'Rice wrapped in banana leaves', 'Grilled pork belly'], correct: 0, difficulty: 'medium', coinReward: 10 },
  { id: 9, category: '🌶️ Bicol', question: 'What is the Bicolano word for "thank you" in the local dialect?', options: ['Salamat', 'Dios mabalos', 'Maraming salamat', 'Salamat po'], correct: 1, difficulty: 'hard', coinReward: 15 },
  { id: 10, category: '🌶️ Bicol', question: 'Which province in Bicol is known for its whale shark (butanding) interaction?', options: ['Albay', 'Camarines Sur', 'Sorsogon', 'Camarines Norte'], correct: 2, difficulty: 'medium', coinReward: 10 },

  // ── Food & Snacks ──
  { id: 11, category: '🍕 Food', question: 'What is musubi primarily made of?', options: ['Bread and butter', 'Rice, meat, and nori seaweed', 'Pasta and cheese', 'Tortilla and beans'], correct: 1, difficulty: 'easy', coinReward: 5 },
  { id: 12, category: '🍕 Food', question: 'What gives churros their classic ridged shape?', options: ['Being rolled by hand', 'Being piped through a star-shaped nozzle', 'Being cut with special scissors', 'Being pressed in a mold'], correct: 1, difficulty: 'medium', coinReward: 10 },
  { id: 13, category: '🍕 Food', question: 'What is coffee jelly primarily made of?', options: ['Coffee-flavored gelatin with cream', 'Frozen coffee ice cream', 'Coffee beans and sugar', 'Espresso and milk foam'], correct: 0, difficulty: 'easy', coinReward: 5 },
  { id: 14, category: '🍕 Food', question: 'What is the main ingredient in a classic Filipino ensaymada?', options: ['Rice flour', 'Enriched bread dough with butter and cheese', 'Corn meal', 'Cassava'], correct: 1, difficulty: 'medium', coinReward: 10 },
  { id: 15, category: '🍕 Food', question: 'What does "bento" mean in Japanese?', options: ['Delicious meal', 'Packed lunch box', 'Rice ball', 'Street food'], correct: 1, difficulty: 'easy', coinReward: 5 },

  // ── Mario & Gaming ──
  { id: 16, category: '🍄 Mario', question: 'What is the name of Mario\'s brother?', options: ['Wario', 'Luigi', 'Toad', 'Yoshi'], correct: 1, difficulty: 'easy', coinReward: 5 },
  { id: 17, category: '🍄 Mario', question: 'What does a Super Star do in Mario games?', options: ['Makes Mario invincible temporarily', 'Gives extra lives', 'Opens secret doors', 'Transforms Mario'], correct: 0, difficulty: 'easy', coinReward: 5 },
  { id: 18, category: '🍄 Mario', question: 'What is the name of the princess Mario always rescues?', options: ['Princess Daisy', 'Princess Peach', 'Princess Rosalina', 'Princess Zelda'], correct: 1, difficulty: 'easy', coinReward: 5 },
  { id: 19, category: '🍄 Mario', question: 'What power-up makes Mario grow bigger?', options: ['Super Star', 'Fire Flower', 'Super Mushroom', '1-Up Mushroom'], correct: 2, difficulty: 'easy', coinReward: 5 },
  { id: 20, category: '🍄 Mario', question: 'In which year was the original Super Mario Bros. released?', options: ['1983', '1985', '1987', '1990'], correct: 1, difficulty: 'hard', coinReward: 15 },

  // ── General Knowledge ──
  { id: 21, category: '🧠 General', question: 'What is the currency of the Philippines?', options: ['Dollar', 'Peso', 'Yuan', 'Euro'], correct: 1, difficulty: 'easy', coinReward: 5 },
  { id: 22, category: '🧠 General', question: 'How many provinces are in the Bicol Region?', options: ['4', '5', '6', '7'], correct: 2, difficulty: 'medium', coinReward: 10 },
  { id: 23, category: '🧠 General', question: 'What is the largest island in the Philippines?', options: ['Mindanao', 'Visayas', 'Luzon', 'Palawan'], correct: 2, difficulty: 'easy', coinReward: 5 },
  { id: 24, category: '🧠 General', question: 'What year did the Philippines gain independence?', options: ['1896', '1898', '1946', '1986'], correct: 2, difficulty: 'medium', coinReward: 10 },
  { id: 25, category: '🧠 General', question: 'What is the national bird of the Philippines?', options: ['Eagle', 'Maya bird', 'Parrot', 'Dove'], correct: 0, difficulty: 'medium', coinReward: 10 },
];

// ─── Game Types ──────────────────────────────────────────────
type GamePhase = 'menu' | 'playing' | 'feedback' | 'gameover' | 'complete';

const QUESTION_TIME = 15; // seconds per question
const MAX_LIVES = 3;
const STREAK_BONUS = 5; // extra coins per streak

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
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);
    const saved = parseInt(localStorage.getItem('muragoods_trivia_highscore') || '0', 10);
    setHighScore(saved);
  }, [router]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
    setTimer(QUESTION_TIME);
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

  const startGame = useCallback(() => {
    let pool = [...allQuestions];
    if (selectedCategory !== 'all') {
      pool = pool.filter(q => q.category === selectedCategory);
    }
    // Shuffle and pick 10
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 10);
    setQuestions(shuffled);
    setCurrentIndex(0);
    setLives(MAX_LIVES);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCoinsEarned(0);
    setTotalCorrect(0);
    setTotalWrong(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setPhase('playing');
  }, [selectedCategory]);

  const handleAnswer = useCallback((answerIndex: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (phase !== 'playing') return;

    const q = questions[currentIndex];
    if (!q) return;

    const correct = answerIndex === q.correct || answerIndex === -1;
    setSelectedAnswer(answerIndex);
    setIsCorrect(correct);

    if (correct) {
      const timeBonus = timer > 10 ? 5 : timer > 5 ? 3 : 0;
      const streakBonus = streak >= 2 ? STREAK_BONUS * Math.min(streak - 1, 5) : 0;
      const total = q.coinReward + timeBonus + streakBonus;
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
        if (coinsEarned > 0) addCoins(coinsEarned, 'Trivia Challenge — Game Over');
        setPhase('gameover');
      } else if (currentIndex >= questions.length - 1) {
        // Completed all questions
        if (coinsEarned > 0) addCoins(coinsEarned, 'Trivia Challenge — Quest Complete');
        const finalScore = score;
        if (finalScore > highScore) {
          setHighScore(finalScore);
          localStorage.setItem('muragoods_trivia_highscore', String(finalScore));
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

            {/* High Score */}
            {highScore > 0 && (
              <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] p-4 rounded-2xl text-center mb-6">
                <p className="text-[9px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>High Score</p>
                <p className="coin-price text-xl mt-1">{highScore} 🪙</p>
              </div>
            )}

            {/* How It Works */}
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 mb-6">
              <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>How It Works</h2>
              <div className="space-y-3">
                {[
                  { icon: '❤️', text: `You have ${MAX_LIVES} lives — lose all and it's game over!` },
                  { icon: '⏱️', text: `${QUESTION_TIME} seconds per question — faster = more bonus coins!` },
                  { icon: '🔥', text: 'Build streaks for bonus coins (2+ correct in a row)' },
                  { icon: '🪙', text: 'Earn 5-15 coins per correct answer + time & streak bonuses' },
                ].map(item => (
                  <div key={item.icon} className="flex items-center gap-3">
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

            {/* Start Button */}
            <div className="text-center">
              <button
                onClick={startGame}
                className="deco-btn deco-btn-gold deco-btn-lg rounded-2xl pulse-glow"
                style={{ fontFamily: 'var(--font-arcade)', minWidth: '220px' }}
              >
                🎮 START GAME
              </button>
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
                  <button onClick={startGame} className="deco-btn deco-btn-gold flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
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
                  <button onClick={startGame} className="deco-btn deco-btn-gold flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
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
  const timerPercent = (timer / QUESTION_TIME) * 100;
  const timerColor = timer > 10 ? 'var(--emerald-bright)' : timer > 5 ? 'var(--gold-bright)' : 'var(--crimson)';

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
