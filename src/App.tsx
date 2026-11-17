import "./App.css";

function App() {
  return (
    <main className="app" data-testid="apps-in-toss-starter">
      <header className="app-header">
        <h1 className="page-title">갈만해</h1>
        <p className="page-subtitle">앱인토스 미니앱 스캐폴드 (stage 1)</p>
      </header>

      <nav className="app-actions" aria-label="Apps in Toss 링크">
        <a className="app-button app-button-primary" href="https://developers-apps-in-toss.toss.im" target="_blank" rel="noopener noreferrer">
          개발자센터
        </a>
        <a className="app-button app-button-primary" href="https://techchat-apps-in-toss.toss.im" target="_blank" rel="noopener noreferrer">
          개발자 커뮤니티
        </a>
      </nav>

      <div className="app-logo-wrap">
        <img className="logo" src={`${import.meta.env.BASE_URL}appsintoss-logo.png`} alt="Apps in Toss" />
      </div>
    </main>
  );
}

export default App;
