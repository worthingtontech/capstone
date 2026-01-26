import './App.css';

function App(): React.JSX.Element {
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
            A direct-to-consumer platform that connects local suppliers with customers and
            delivers quality ingredients on your schedule.
          </p>
          <button className="cta-button" type="button">Get Started</button>
        </div>
      </header>

      <section id="features" className="features">
        <h2>Why Choose Us</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <h3>Farm Fresh</h3>
            <p>Source inventory directly from regional partners and farms.</p>
          </div>
          <div className="feature-card">
            <h3>Fast Delivery</h3>
            <p>Coordinate pickup and delivery windows with reliable logistics.</p>
          </div>
          <div className="feature-card">
            <h3>Easy Ordering</h3>
            <p>Order, track, and manage subscriptions in a few clicks.</p>
          </div>
        </div>
      </section>

      <section id="about" className="about">
        <h2>Built for Growing Distributors</h2>
        <p>
          Secure infrastructure, real-time inventory, and scalable search let your team focus
          on customers while the platform handles the rest.
        </p>
      </section>

      <section id="contact" className="contact">
        <h2>Ready to Launch?</h2>
        <p>Contact us to start your pilot and configure delivery regions.</p>
        <button className="secondary-button" type="button">Talk to Sales</button>
      </section>

      <footer className="footer">
        <p>Copyright 2026 D2C Food Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
