import { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const helloWorldApi = async () => {
    try {
      const response = await axios.get(`${API}/`);
      console.log(response.data.message);
    } catch (e) {
      console.error(e, `errored out requesting / api`);
    }
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setQuestion("");
    setAnswer("");
    setError("");
    setIsLoading(false);
  };

  useEffect(() => {
    if (!isChatOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeChat();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isChatOpen]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setError("Digite uma pergunta antes de enviar.");
      return;
    }

    setIsLoading(true);
    setError("");
    setAnswer("");

    try {
      const response = await axios.post(`${API}/ask`, {
        question: trimmedQuestion,
      });

      setAnswer(response.data.answer);
    } catch (askError) {
      console.error("Erro ao consultar a IA", askError);
      setError("Não foi possível obter uma resposta agora. Tente novamente em instantes.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    helloWorldApi();
  }, []);

  return (
    <div>
      <header className="App-header">
        <div className="ask-ai-fab">
          <span className="ask-ai-label-text">Pergunte a I.A</span>
          <button
            className="ask-ai-fab-button"
            type="button"
            onClick={() => setIsChatOpen(true)}
            aria-label="Abrir chat com a inteligência artificial"
          >
            IA
          </button>
        </div>
        <a
          className="App-link"
          href="https://emergent.sh"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="https://avatars.githubusercontent.com/in/1201222?s=120&u=2686cf91179bbafbc7a71bfbc43004cf9ae1acea&v=4" />
        </a>
        <p className="mt-5">Building something incredible ~!</p>
        {isChatOpen ? (
          <div
            className="ai-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-modal-title"
            onClick={closeChat}
          >
            <div className="ai-modal" onClick={(event) => event.stopPropagation()}>
              <div className="ai-modal-header">
                <h2 id="ai-modal-title">Converse com a inteligência artificial</h2>
                <button className="ai-close-button" type="button" onClick={closeChat} aria-label="Fechar">
                  ×
                </button>
              </div>
              <form className="ai-form" onSubmit={handleSubmit}>
                <label className="ai-label" htmlFor="ai-question">
                  Faça sua pergunta personalizada
                </label>
                <textarea
                  id="ai-question"
                  className="ai-textarea"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="Como posso ajudar hoje?"
                />
                {error && <p className="ai-error">{error}</p>}
                <button className="ai-submit" type="submit" disabled={isLoading}>
                  {isLoading ? "Consultando..." : "Enviar"}
                </button>
              </form>
              {answer && (
                <div className="ai-response">
                  <h3>Resposta</h3>
                  <p>{answer}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </header>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />}>
            <Route index element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
