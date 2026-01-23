import './App.css';

function App() {
  return (
    <div className="app">
      <header className="hero">
        <nav className="nav">
          <div className="logo">D2C Food Platform</div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </div>
        </nav>
        <div className="hero-content">
          <h1>Fresh Food, Direct to You</h1>
          <p>
            Experience the future of food delivery with our direct-to-consumer
            platform. Quality ingredients, transparent sourcing, delivered to
            your door.
          </p>
          <button className="cta-button">Get Started</button>
        </div>
      </header>

      <section id="features" className="features">
        <h2>Why Choose Us</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">🥬</div>
            <h3>Farm Fresh</h3>
            <p>Sourced directly from local farms for maximum freshness</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🚚</div>
            <h3>Fast Delivery</h3>
            <p>Same-day delivery to keep your ingredients at peak quality</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Easy Ordering</h3>
            <p>Simple, intuitive ordering experience on any device</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>&copy; 2026 D2C Food Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
