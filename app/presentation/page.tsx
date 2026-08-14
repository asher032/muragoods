'use client';

import { useEffect, useState } from 'react';

interface Stats {
  totalSales: number;
  activeOrders: number;
  menuItems: number;
  registeredPlayers: number;
}

export default function PresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setStats(result.data);
        }
      })
      .catch(() => {});
  }, []);

  const slides = [
    {
      id: 'hero',
      title: 'Home Page',
      theme: 'nintendo-red',
    },
    {
      id: 'login',
      title: 'Login Page',
      theme: 'nintendo-red',
    },
    {
      id: 'signup',
      title: 'Sign Up Page',
      theme: 'luigi-green',
    },
    {
      id: 'menu',
      title: 'Menu Page',
      theme: 'menu',
    },
    {
      id: 'orders',
      title: 'Orders Page',
      theme: 'orders',
    },
    {
      id: 'checkout',
      title: 'Checkout Page',
      theme: 'checkout',
    },
    {
      id: 'admin',
      title: 'Admin Dashboard',
      theme: 'admin',
    },
  ];

  const next = () => setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
  const prev = () => setCurrentSlide((prev) => Math.max(prev - 1, 0));

  return (
    <div style={{ fontFamily: "'Segoe UI', 'Arial Rounded MT Bold', 'Arial', sans-serif" }}>
      {/* SLIDE 1: HERO */}
      {currentSlide === 0 && (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: 'linear-gradient(135deg, #E60012 0%, #c2000e 100%)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            color: 'white',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '120px',
              background: '#1a1a1a',
              clipPath: 'polygon(0 40%, 100% 0, 100% 100%, 0 100%)',
              zIndex: 1,
            }}
          />
          <div style={{ position: 'relative', zIndex: 2, maxWidth: '900px', padding: '40px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: '#FFD700',
                color: '#1a1a1a',
                padding: '10px 24px',
                borderRadius: '50px',
                fontWeight: 900,
                fontSize: '0.9rem',
                textTransform: 'uppercase',
                marginBottom: '20px',
                boxShadow: '0 4px 0 #b39700',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🪙</span>
              <span>NEW! Mushroom Kingdom Express</span>
            </div>
            <div
              style={{
                fontSize: '12rem',
                filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))',
                animation: 'float 3s ease-in-out infinite',
                lineHeight: 1,
                margin: '20px 0',
              }}
            >
              🍄
            </div>
            <h1
              style={{
                fontSize: '3rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                textShadow: '4px 4px 0 rgba(0,0,0,0.3)',
                marginBottom: '20px',
                lineHeight: 1.1,
              }}
            >
              Welcome to the Mushroom Kingdom Express!
            </h1>
            <p
              style={{
                fontSize: '1.4rem',
                marginBottom: '30px',
                textShadow: '2px 2px 0 rgba(0,0,0,0.2)',
                lineHeight: 1.6,
              }}
            >
              Fuel your adventure with iconic treats and power-ups delivered straight to your door!
            </p>
            <button
              className="pill-btn"
              style={{
                display: 'inline-block',
                padding: '14px 32px',
                borderRadius: '50px',
                background: '#FFD700',
                color: '#1a1a1a',
                fontWeight: 900,
                fontSize: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 6px 0 #b39700, 0 10px 20px rgba(0,0,0,0.3)',
              }}
              onClick={() => alert('Ordering coming soon!')}
            >
              Order Now &gt;
            </button>
          </div>
        </div>
      )}

      {/* SLIDE 2: LOGIN */}
      {currentSlide === 1 && (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            flexDirection: 'row',
            background: '#E60012',
          }}
        >
          <div
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #E60012, #c2000e)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: '-50px',
                top: 0,
                bottom: 0,
                width: '100px',
                background: '#1a1a1a',
                transform: 'skewX(-15deg)',
              }}
            />
            <div
              style={{
                fontSize: '8rem',
                filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.4))',
                animation: 'wave 2s ease-in-out infinite',
                position: 'relative',
                zIndex: 2,
              }}
            >
              👋
            </div>
            <h2
              style={{
                color: 'white',
                marginTop: '20px',
                textShadow: '2px 2px 0 rgba(0,0,0,0.3)',
                position: 'relative',
                zIndex: 2,
              }}
            >
              Mario
            </h2>
          </div>
          <div
            style={{
              flex: 1,
              background: '#1a1a1a',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '40px',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.03) 10px, rgba(255,255,255,0.03) 20px)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                background: '#2a2a2a',
                border: '3px solid #333',
                borderRadius: '20px',
                padding: '40px',
                width: '100%',
                maxWidth: '420px',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <h2 style={{ color: 'white', marginBottom: '8px' }}>Player 1, Press Start</h2>
              <p style={{ color: '#aaa', marginBottom: '24px', fontSize: '0.95rem' }}>
                Welcome back! Enter your details to access your saved orders and favorite menu items.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  alert('Login demo!');
                }}
              >
                <div style={{ marginBottom: '20px' }}>
                  <label
                    style={{
                      display: 'block',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      letterSpacing: '1px',
                    }}
                  >
                    User ID / Mushroom ID
                  </label>
                  <input
                    type="text"
                    placeholder="player1"
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: '3px solid #444',
                      background: '#1a1a1a',
                      color: 'white',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label
                    style={{
                      display: 'block',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      letterSpacing: '1px',
                    }}
                  >
                    Secret Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: '3px solid #444',
                      background: '#1a1a1a',
                      color: 'white',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '14px 32px',
                    borderRadius: '50px',
                    background: '#FFD700',
                    color: '#1a1a1a',
                    fontWeight: 900,
                    fontSize: '1rem',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 6px 0 #b39700, 0 10px 20px rgba(0,0,0,0.3)',
                    marginTop: '10px',
                  }}
                >
                  Log In &gt;
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE 3: SIGNUP */}
      {currentSlide === 2 && (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: 'linear-gradient(135deg, #27ae60, #1e8449)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '60px',
              background: '#1a1a1a',
              clipPath: 'polygon(0 0, 100% 50%, 100% 100%, 0 100%)',
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '60px',
              background: '#1a1a1a',
              clipPath: 'polygon(0 0, 100% 50%, 100% 100%, 0 100%)',
              bottom: 0,
              transform: 'scaleY(-1)',
              zIndex: 2,
            }}
          />
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              padding: '80px 40px',
              position: 'relative',
              zIndex: 3,
            }}
          >
            <div
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: '#FFD700',
                border: '6px solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                marginBottom: '24px',
                boxShadow: '0 8px 0 #b39700, 0 15px 30px rgba(0,0,0,0.3)',
              }}
            >
              🌱
            </div>
            <h1
              style={{
                color: 'white',
                textShadow: '3px 3px 0 rgba(0,0,0,0.3)',
                fontSize: '3rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                lineHeight: 1.1,
              }}
            >
              Join the Crew (New Game)
            </h1>
            <p
              style={{
                color: 'rgba(255,255,255,0.9)',
                maxWidth: '600px',
                marginTop: '10px',
                fontSize: '1.1rem',
                fontWeight: 600,
                lineHeight: 1.6,
              }}
            >
              Create your profile today and earn 100 Bonus Coins on your very first order!
            </p>
            <div
              style={{
                background: 'rgba(255,255,255,0.95)',
                borderRadius: '24px',
                padding: '40px',
                width: '100%',
                maxWidth: '500px',
                marginTop: '30px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  alert('Signup demo!');
                }}
              >
                <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                  <label
                    style={{
                      display: 'block',
                      color: '#1a1a1a',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      letterSpacing: '1px',
                    }}
                  >
                    Choose Your Player Name
                  </label>
                  <input
                    type="text"
                    placeholder="LuigiFan42"
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: '3px solid #ddd',
                      background: '#f5f5f5',
                      color: '#1a1a1a',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                  <label
                    style={{
                      display: 'block',
                      color: '#1a1a1a',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      letterSpacing: '1px',
                    }}
                  >
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="player@kingdom.com"
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: '3px solid #ddd',
                      background: '#f5f5f5',
                      color: '#1a1a1a',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                  <label
                    style={{
                      display: 'block',
                      color: '#1a1a1a',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      letterSpacing: '1px',
                    }}
                  >
                    Create Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: '3px solid #ddd',
                      background: '#f5f5f5',
                      color: '#1a1a1a',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '14px 32px',
                    borderRadius: '50px',
                    background: '#27ae60',
                    color: 'white',
                    fontWeight: 900,
                    fontSize: '1rem',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 6px 0 #1e8449, 0 10px 20px rgba(0,0,0,0.2)',
                  }}
                >
                  Create Account &gt;
                </button>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#FFD700',
                    color: '#1a1a1a',
                    padding: '8px 16px',
                    borderRadius: '50px',
                    fontWeight: 900,
                    fontSize: '0.85rem',
                    marginTop: '16px',
                    boxShadow: '0 3px 0 #b39700',
                  }}
                >
                  <span>🪙</span>
                  <span>+100 Bonus Coins on first order!</span>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE 4: MENU */}
      {currentSlide === 3 && (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: 'linear-gradient(180deg, #2c3e50, #1a252f)',
            padding: '60px 40px',
            overflowY: 'auto',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h1
              style={{
                color: '#FFD700',
                textShadow: '3px 3px 0 rgba(0,0,0,0.5)',
                fontSize: '3rem',
                fontWeight: 900,
                textTransform: 'uppercase',
              }}
            >
              Choose Your Power-Up Menu
            </h1>
            <p
              style={{
                color: '#ccc',
                marginTop: '10px',
                fontSize: '1.1rem',
                fontWeight: 600,
                lineHeight: 1.6,
              }}
            >
              Pick your favorites from our legendary selection of meals, drinks, and side quests.
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '20px',
              maxWidth: '1200px',
              margin: '0 auto 40px',
            }}
          >
            {[
              { emoji: '🍔', name: 'Super Mushroom Meal', desc: 'Full burger combo set.', color: '#ffebee' },
              { emoji: '🍗', name: 'Fire Flower Wings', desc: 'Spicy boneless chicken.', color: '#fff3e0' },
              { emoji: '🥤', name: 'Super Star Shake', desc: 'Vanilla sparkle milkshake.', color: '#f3e5f5' },
              { emoji: '🍎', name: "Yoshi's Fruit Bowl", desc: 'Fresh seasonal fruit platter.', color: '#e8f5e9' },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  background: 'white',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  boxShadow: '0 10px 0 rgba(0,0,0,0.3)',
                  border: '4px solid transparent',
                  transition: 'transform 0.2s, border-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.borderColor = '#FFD700';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                <div
                  style={{
                    height: '140px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '4rem',
                    borderBottom: '4px solid rgba(0,0,0,0.1)',
                    background: item.color,
                  }}
                >
                  {item.emoji}
                </div>
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <h3
                    style={{
                      color: '#1a1a1a',
                      fontSize: '1.1rem',
                      marginBottom: '6px',
                      fontWeight: 900,
                    }}
                  >
                    {item.name}
                  </h3>
                  <p style={{ color: '#666', fontSize: '0.85rem', fontWeight: 600 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <button
              className="pill-btn"
              onClick={() => alert('Add to cart demo!')}
            >
              Add to Cart &gt;
            </button>
          </div>
        </div>
      )}

      {/* SLIDE 5: ORDERS */}
      {currentSlide === 4 && (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: '#1a1a1a',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            color: 'white',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '40px',
              background: '#E60012',
              top: 0,
              clipPath: 'ellipse(70% 100% at 50% 0%)',
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '40px',
              background: '#E60012',
              bottom: 0,
              clipPath: 'ellipse(70% 100% at 50% 100%)',
              zIndex: 2,
            }}
          />
          <div style={{ position: 'relative', zIndex: 1, padding: '40px', maxWidth: '800px' }}>
            <h1
              style={{
                fontSize: '3rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                textShadow: '3px 3px 0 rgba(0,0,0,0.5)',
                marginBottom: '10px',
              }}
            >
              Track Your Quest
            </h1>
            <p
              style={{
                color: '#ccc',
                maxWidth: '600px',
                margin: '10px auto 30px',
                fontSize: '1.1rem',
                fontWeight: 600,
                lineHeight: 1.6,
              }}
            >
              Your food is currently being prepped in Bowser&apos;s Castle Kitchen!
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0,
                margin: '30px 0',
                flexWrap: 'wrap',
              }}
            >
              {[
                { label: 'Order Received', status: 'completed' },
                { label: 'In the Kitchen', status: 'completed' },
                { label: 'Out for Delivery', status: 'pending' },
                { label: 'Delivered', status: 'pending' },
              ].map((step, i, arr) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '1.2rem',
                        border: '4px solid white',
                        background: step.status === 'completed' ? '#27ae60' : '#555',
                        color: step.status === 'completed' ? 'white' : '#aaa',
                      }}
                    >
                      {step.status === 'completed' ? '✓' : i + 1}
                    </div>
                    <span
                      style={{
                        marginTop: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: step.status === 'completed' ? '#27ae60' : '#aaa',
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < arr.length - 1 && (
                    <div
                      style={{
                        width: '60px',
                        height: '4px',
                        background: step.status === 'completed' ? '#27ae60' : '#555',
                        margin: '0 8px',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div
              style={{
                background: '#2a2a2a',
                border: '3px solid #444',
                borderRadius: '16px',
                padding: '24px 32px',
                marginTop: '20px',
                boxShadow: '0 8px 0 rgba(0,0,0,0.4)',
              }}
            >
              <p style={{ color: 'white', fontSize: '1rem' }}>
                <strong style={{ color: '#FFD700' }}>Order #1UP-8492</strong> • 2x Super Mushroom Meals, 1x Super Star Shake
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE 6: CHECKOUT */}
      {currentSlide === 5 && (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: 'linear-gradient(135deg, #2c3e50, #1a252f)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            padding: '40px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '24px',
              padding: '32px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 15px 0 rgba(0,0,0,0.3)',
              color: '#1a1a1a',
            }}
          >
            <h2 style={{ color: '#1a1a1a', marginBottom: '20px' }}>Final Stage: Checkout</h2>
            <p style={{ color: '#666', marginBottom: '20px', fontSize: '0.95rem', lineHeight: 1.6 }}>
              Review your items and select your payment method to complete the level.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '2px solid #eee',
                fontWeight: 700,
              }}
            >
              <span>Subtotal</span>
              <span>25 Gold Coins ($25.00)</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '2px solid #eee',
                fontWeight: 700,
              }}
            >
              <span>Delivery Fee</span>
              <span>2 Gold Coins ($2.00)</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '16px 0',
                fontSize: '1.4rem',
                fontWeight: 900,
                color: '#E60012',
                borderTop: '4px solid #1a1a1a',
                marginTop: '10px',
              }}
            >
              <span>Total</span>
              <span>27 Gold Coins ($27.00)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              <button
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  border: '3px solid #ddd',
                  background: '#f9f9f9',
                  fontWeight: 800,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                💳 GCash — Instant Payment
              </button>
              <button
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  border: '3px solid #ddd',
                  background: '#f9f9f9',
                  fontWeight: 800,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                🪙 Cash on Delivery
              </button>
              <button
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  border: '3px solid #ddd',
                  background: '#f9f9f9',
                  fontWeight: 800,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                🍄 Coins Only
              </button>
            </div>
            <button
              className="pill-btn"
              style={{ width: '100%', marginTop: '20px', textAlign: 'center' }}
              onClick={() => alert('Checkout demo!')}
            >
              Confirm & Pay &gt;
            </button>
          </div>
        </div>
      )}

      {/* SLIDE 7: ADMIN */}
      {currentSlide === 6 && (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: 'linear-gradient(135deg, #1a1a1a, #0d0d0d)',
            position: 'relative',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(241, 196, 15, 0.03) 2px, rgba(241, 196, 15, 0.03) 4px)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '40px',
              position: 'relative',
              zIndex: 2,
              maxWidth: '1200px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            <div
              style={{
                marginBottom: '30px',
                borderLeft: '8px solid #f1c40f',
                paddingLeft: '20px',
              }}
            >
              <h1
                style={{
                  color: '#f1c40f',
                  textShadow: '3px 3px 0 rgba(0,0,0,0.8)',
                  fontSize: '3rem',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  lineHeight: 1.1,
                }}
              >
                Bowser&apos;s Command Center
              </h1>
              <p
                style={{
                  color: '#aaa',
                  marginTop: '8px',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  lineHeight: 1.6,
                }}
              >
                Manage inventory, monitor real-time orders, and oversee user activity across the kingdom.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px',
                marginBottom: '30px',
              }}
            >
              <div
                style={{
                  background: '#2a2a2a',
                  border: '3px solid #333',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 0 rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f1c40f', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>
                  {stats ? stats.totalSales.toLocaleString() : '1,280'}
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#aaa',
                    marginTop: '8px',
                    letterSpacing: '1px',
                  }}
                >
                  Total Sales (Gold Coins)
                </div>
              </div>
              <div
                style={{
                  background: '#2a2a2a',
                  border: '3px solid #333',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 0 rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f1c40f', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>
                  {stats ? stats.activeOrders : '14'}
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#aaa',
                    marginTop: '8px',
                    letterSpacing: '1px',
                  }}
                >
                  Active Orders Pending
                </div>
              </div>
              <div
                style={{
                  background: '#2a2a2a',
                  border: '3px solid #333',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 0 rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f1c40f', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>
                  {stats ? stats.menuItems : '24'}
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#aaa',
                    marginTop: '8px',
                    letterSpacing: '1px',
                  }}
                >
                  Menu Items Active
                </div>
              </div>
              <div
                style={{
                  background: '#2a2a2a',
                  border: '3px solid #333',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 0 rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f1c40f', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>
                  {stats ? stats.registeredPlayers : '450'}
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#aaa',
                    marginTop: '8px',
                    letterSpacing: '1px',
                  }}
                >
                  Registered Players
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #2a2a2a, #1a1a1a)',
                  border: '3px solid #333',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 0 rgba(0,0,0,0.5)',
                }}
              >
                <h3 style={{ color: 'white', fontSize: '1.1rem', marginBottom: '10px' }}>✏️ Edit Menu</h3>
                <p style={{ color: '#888', fontSize: '0.85rem', fontWeight: 600 }}>
                  Update prices, descriptions, and stock status.
                </p>
                <button
                  className="pill-btn"
                  style={{ marginTop: '16px', fontSize: '0.8rem', padding: '10px 24px' }}
                  onClick={() => alert('Edit menu demo!')}
                >
                  Manage Menu
                </button>
              </div>
              <div
                style={{
                  background: 'linear-gradient(135deg, #2a2a2a, #1a1a1a)',
                  border: '3px solid #333',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 0 rgba(0,0,0,0.5)',
                }}
              >
                <h3 style={{ color: 'white', fontSize: '1.1rem', marginBottom: '10px' }}>📦 Manage Orders</h3>
                <p style={{ color: '#888', fontSize: '0.85rem', fontWeight: 600 }}>
                  Update live order status (Kitchen → Delivery).
                </p>
                <button
                  className="pill-btn"
                  style={{ marginTop: '16px', fontSize: '0.8rem', padding: '10px 24px' }}
                  onClick={() => alert('Manage orders demo!')}
                >
                  View Orders
                </button>
              </div>
              <div
                style={{
                  background: 'linear-gradient(135deg, #2a2a2a, #1a1a1a)',
                  border: '3px solid #333',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 0 rgba(0,0,0,0.5)',
                }}
              >
                <h3 style={{ color: 'white', fontSize: '1.1rem', marginBottom: '10px' }}>👥 User Management</h3>
                <p style={{ color: '#888', fontSize: '0.85rem', fontWeight: 600 }}>
                  View profiles and player order histories.
                </p>
                <button
                  className="pill-btn"
                  style={{ marginTop: '16px', fontSize: '0.8rem', padding: '10px 24px' }}
                  onClick={() => alert('User management demo!')}
                >
                  Manage Users
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div
        style={{
          position: 'fixed',
          bottom: '30px',
          left: '30px',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          padding: '10px 20px',
          borderRadius: '30px',
          fontWeight: 800,
          fontSize: '0.9rem',
          zIndex: 1000,
          border: '2px solid rgba(255,255,255,0.2)',
          color: 'white',
        }}
      >
        {currentSlide + 1} / {slides.length}
      </div>
      <div style={{ position: 'fixed', bottom: '30px', right: '30px', display: 'flex', gap: '12px', zIndex: 1000 }}>
        <button
          onClick={prev}
          disabled={currentSlide === 0}
          style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255,255,255,0.3)',
            color: 'white',
            fontSize: '1.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: currentSlide === 0 ? 0.3 : 1,
          }}
        >
          ‹
        </button>
        <button
          onClick={next}
          disabled={currentSlide === slides.length - 1}
          style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255,255,255,0.3)',
            color: 'white',
            fontSize: '1.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: currentSlide === slides.length - 1 ? 0.3 : 1,
          }}
        >
          ›
        </button>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(-5deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(10deg); }
          75% { transform: rotate(-10deg); }
        }
      `}</style>
    </div>
  );
}
