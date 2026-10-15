'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const emptyProduct = { nome: '', quantidade: '', valor: '', categoria: '' };
const localDateTime = () => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const localDate = () => localDateTime().slice(0, 10);
const views = [
  { id: 'overview', label: 'Visão geral', icon: 'grid' },
  { id: 'products', label: 'Produtos', icon: 'box' },
  { id: 'movements', label: 'Movimentações', icon: 'swap' },
  { id: 'reports', label: 'Relatórios', icon: 'chart' }
];

function Icon({ name, size = 19 }) {
  const attrs = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
    strokeLinejoin: 'round', 'aria-hidden': true
  };
  const paths = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    swap: <><path d="M7 7h13l-3-3M17 17H4l3 3" /><path d="M20 7v5M4 17v-5" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15v5Z" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    moon: <path d="M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z" />
  };
  return <svg {...attrs}>{paths[name] || paths.grid}</svg>;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api/stock?path=${encodeURIComponent(path)}`, {
    cache: 'no-store',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a solicitação.');
  return data;
}

function AmbientBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !container || !context) return;

    const radius = 7.5;
    const gridLines = 52;
    const gridSteps = 64;
    const particles = Array.from({ length: 620 }, (_, index) => {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const distance = radius * Math.sqrt((index + 0.5) / 620);
      return {
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        phase: (index * 0.61803398875) % 1
      };
    });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let frame = 0;
    let lastFrame = 0;
    let visible = !document.hidden;
    let lineColor = '78, 123, 86';
    let pointColor = '68, 119, 78';

    const readColors = () => {
      const styles = getComputedStyle(document.documentElement);
      lineColor = styles.getPropertyValue('--ambient-line').trim() || lineColor;
      pointColor = styles.getPropertyValue('--ambient-particle').trim() || pointColor;
    };

    const waveHeight = (x, z, time) => (
      Math.sin(x * 0.78 + time * 0.34) * Math.cos(z * 0.67 - time * 0.25) * 0.82 +
      Math.sin((x + z) * 0.49 + time * 0.28) * 0.4 +
      Math.cos(Math.hypot(x, z) * 0.74 - time * 0.22) * 0.28
    );

    const draw = (timestamp) => {
      if (!visible) return;
      if (!reducedMotion.matches && timestamp - lastFrame < 32) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastFrame = timestamp;
      const time = reducedMotion.matches ? 0 : timestamp * 0.00024;
      context.clearRect(0, 0, width, height);

      const scale = Math.min(width / 19, height / 13, 72);
      const centerX = width * 0.56;
      const centerY = height * 0.54;
      const project = (x, z, elevation = 0) => {
        const diagonal = Math.SQRT1_2;
        return [
          centerX + (x - z) * diagonal * scale,
          centerY + (x + z) * diagonal * scale * 0.34 - elevation * scale * 0.48
        ];
      };
      const edgeFade = (x, z) => {
        const distance = Math.hypot(x, z) / radius;
        return Math.max(0, Math.min(1, (1 - distance) * 3.2));
      };

      context.lineWidth = Math.max(0.65, scale / 105);
      context.lineCap = 'round';
      for (let direction = 0; direction < 2; direction += 1) {
        for (let row = 0; row <= gridLines; row += 1) {
          const fixed = (row / gridLines - 0.5) * radius * 2;
          const halfSpan = Math.sqrt(Math.max(0, radius * radius - fixed * fixed));
          context.beginPath();
          let started = false;
          let rowFade = 0;
          for (let step = 0; step <= gridSteps; step += 1) {
            const moving = (step / gridSteps * 2 - 1) * halfSpan;
            const x = direction === 0 ? moving : fixed;
            const z = direction === 0 ? fixed : moving;
            const fade = edgeFade(x, z);
            const point = project(x, z, waveHeight(x, z, time));
            if (fade < 0.025) {
              started = false;
              continue;
            }
            rowFade += fade;
            if (!started) {
              context.moveTo(point[0], point[1]);
              started = true;
            } else {
              context.lineTo(point[0], point[1]);
            }
          }
          context.strokeStyle = `rgba(${lineColor}, ${0.09 + (rowFade / (gridSteps + 1)) * 0.14})`;
          context.stroke();
        }
      }

      particles.forEach((particle, index) => {
        const phase = (particle.phase + (reducedMotion.matches ? 0 : time * 0.12)) % 1;
        const lift = phase * 1.05;
        const fade = edgeFade(particle.x, particle.z) * Math.sin(Math.PI * phase);
        if (fade < 0.025) return;
        const point = project(particle.x, particle.z, waveHeight(particle.x, particle.z, time) + lift);
        const size = 0.6 + (index % 3) * 0.2;
        context.beginPath();
        context.arc(point[0], point[1], size, 0, Math.PI * 2);
        context.fillStyle = `rgba(${pointColor}, ${fade * (reducedMotion.matches ? 0.17 : 0.24)})`;
        context.fill();
      });

      if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      lastFrame = 0;
      if (visible) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      }
    };
    const setVisibility = () => {
      visible = !document.hidden;
      if (visible) frame = requestAnimationFrame(draw);
      else cancelAnimationFrame(frame);
    };
    const setMotionPreference = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const themeObserver = new MutationObserver(readColors);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const resizeObserver = new ResizeObserver(resize);

    readColors();
    resizeObserver.observe(container);
    document.addEventListener('visibilitychange', setVisibility);
    reducedMotion.addEventListener('change', setMotionPreference);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', setVisibility);
      reducedMotion.removeEventListener('change', setMotionPreference);
    };
  }, []);

  return <div className="ambient-background" aria-hidden="true"><canvas ref={canvasRef} className="ambient-canvas" /></div>;
}

function ProductDialog({ product, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(product || emptyProduct);
  useEffect(() => setForm(product || emptyProduct), [product]);

  function submit(event) {
    event.preventDefault();
    onSave({
      nome: form.nome.trim(),
      quantidade: Number(form.quantidade),
      valor: Number(form.valor),
      categoria: form.categoria.trim()
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" aria-describedby="product-dialog-description">
        <div className="modal-heading">
          <div><span className="eyebrow">{product ? 'ATUALIZAÇÃO' : 'NOVO CADASTRO'}</span><h2 id="product-dialog-title">{product ? 'Editar produto' : 'Adicionar produto'}</h2><p id="product-dialog-description">Preencha os dados para manter o catálogo atualizado.</p></div>
        <button className="close-button" type="button" onClick={onClose} aria-label="Fechar janela">×</button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>Nome do produto<input autoFocus required maxLength={120} value={form.nome} placeholder="Ex.: Café em grãos" onChange={(event) => setForm({ ...form, nome: event.target.value })} /></label>
          <div className="form-row">
            <label>Quantidade<input required type="number" min="0" step="any" value={form.quantidade} placeholder="0" onChange={(event) => setForm({ ...form, quantidade: event.target.value })} /></label>
            <label>Valor unitário<input required type="number" min="0" step="0.01" value={form.valor} placeholder="0,00" onChange={(event) => setForm({ ...form, valor: event.target.value })} /></label>
          </div>
          <label>Categoria<input required maxLength={80} value={form.categoria} placeholder="Ex.: Mercearia" onChange={(event) => setForm({ ...form, categoria: event.target.value })} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Salvando...' : product ? 'Salvar alterações' : 'Cadastrar produto'}</button></div>
        </form>
      </section>
    </div>
  );
}

function ProductTable({ products, onEdit, onDelete, compact = false }) {
  if (!products.length) return <div className="empty-state"><span className="empty-icon"><Icon name="box" size={23} /></span><strong>Nenhum produto encontrado</strong><span>Cadastre um produto ou ajuste sua busca.</span></div>;
  return (
    <div className="table-wrap">
      <table aria-label="Produtos cadastrados">
        <thead><tr><th scope="col">PRODUTO</th><th scope="col">CATEGORIA</th><th scope="col">QUANTIDADE</th><th scope="col">VALOR UNITÁRIO</th>{!compact && <th scope="col" className="actions-heading">AÇÕES</th>}</tr></thead>
        <tbody>{products.map((product, index) => (
          <tr key={product.id}>
            <td><div className="product-cell"><span className={`product-avatar tone-${index % 4}`}>{String(product.nome || '?').trim().charAt(0).toUpperCase()}</span><span><strong className="product-name">{product.nome}</strong><small>Cod. {product.id}</small></span></div></td>
            <td><span className="category-tag">{product.categoria || 'Sem categoria'}</span></td>
            <td><strong className="quantity-value">{Number(product.quantidade || 0).toLocaleString('pt-BR')}</strong><span className="quantity-unit"> un.</span></td>
            <td>{Number(product.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            {!compact && <td><div className="row-actions"><button type="button" className="icon-button" onClick={() => onEdit(product)} aria-label={`Editar ${product.nome}`} title="Editar"><Icon name="edit" size={17} /></button><button type="button" className="icon-button delete-action" onClick={() => onDelete(product)} aria-label={`Excluir ${product.nome}`} title="Excluir"><Icon name="trash" size={17} /></button></div></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Overview({ products, categories, onNavigate, onEdit, onDelete, categoryError }) {
  const totalUnits = products.reduce((sum, product) => sum + Number(product.quantidade || 0), 0);
  const stockValue = products.reduce((sum, product) => sum + Number(product.quantidade || 0) * Number(product.valor || 0), 0);
  const largestCategory = Math.max(...categories.map((item) => Number(item.total_categoria || 0)), 0);
  return (
    <>
      <section className="stats-grid">
        <article className="stat-card"><div className="stat-top"><span>Produtos cadastrados</span><span className="stat-icon lavender"><Icon name="box" /></span></div><strong>{products.length}</strong><span className="stat-caption">itens no catálogo</span></article>
        <article className="stat-card"><div className="stat-top"><span>Unidades em estoque</span><span className="stat-icon mint">↗</span></div><strong>{totalUnits.toLocaleString('pt-BR')}</strong><span className="stat-caption">somatório das quantidades</span></article>
        <article className="stat-card"><div className="stat-top"><span>Valor em estoque</span><span className="stat-icon peach">R$</span></div><strong className="stat-regular">{stockValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><span className="stat-caption">quantidade × valor unitário</span></article>
      </section>
      <div className="overview-grid">
        <section className="panel category-panel">
          <div className="section-heading"><div><span className="eyebrow">DISTRIBUIÇÃO</span><h2>Valor por categoria</h2></div><span className="panel-icon"><Icon name="chart" /></span></div>
          {categoryError ? <p className="inline-error">{categoryError}</p> : categories.length ? <div className="category-list">{categories.map((item, index) => {
            const value = Number(item.total_categoria || 0);
            return <div className="category-row" key={item.categoria}><div className="category-label"><span>{item.categoria || 'Sem categoria'}</span><strong>{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><div className="bar-track"><span className={`bar-fill bar-${index % 4}`} style={{ width: `${largestCategory ? Math.max(3, value / largestCategory * 100) : 0}%` }} /></div></div>;
          })}</div> : <div className="empty-inline">Sem dados de categoria disponíveis.</div>}
          <button type="button" className="text-link" onClick={() => onNavigate('reports')}>Ver relatórios <Icon name="arrow" size={15} /></button>
        </section>
        <section className="panel recent-panel">
          <div className="section-heading"><div><span className="eyebrow">CATÁLOGO</span><h2>Produtos cadastrados</h2></div><button type="button" className="text-link" onClick={() => onNavigate('products')}>Ver todos <Icon name="arrow" size={15} /></button></div>
          <ProductTable products={products.slice(0, 4)} compact onEdit={onEdit} onDelete={onDelete} />
        </section>
      </div>
    </>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState('overview');
  const [theme, setTheme] = useState('light');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(null);
  const [error, setError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [movement, setMovement] = useState({ id_produto: '', tipo: 'entrada', quantidade: '', tempo: localDateTime() });
  const [movementBusy, setMovementBusy] = useState(false);
  const [movementMessage, setMovementMessage] = useState('');
  const [movementError, setMovementError] = useState('');
  const [period, setPeriod] = useState({ start: `${localDate().slice(0, 7)}-01`, end: localDate() });
  const [limits, setLimits] = useState({ min: '0', max: '100' });
  const [reports, setReports] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    const savedTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    setTheme(savedTheme);
  }, []);

  function selectTheme(nextTheme) {
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
    try {
      window.localStorage.setItem('estoque-theme', nextTheme);
    } catch {
      // A preferência continua ativa nesta sessão mesmo se o armazenamento estiver indisponível.
    }
  }

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest('listar');
      if (!Array.isArray(data)) throw new Error('A resposta da API para produtos está em formato inesperado.');
      setProducts(data);
      setApiOnline(true);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os produtos.');
      setApiOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setCategoryError('');
    try {
      const data = await apiRequest('categoria');
      if (!Array.isArray(data)) throw new Error('Formato de resposta de categorias inválido.');
      setCategories(data);
    } catch (err) {
      setCategoryError(err.message || 'Não foi possível carregar as categorias.');
    }
  }, []);

  useEffect(() => { loadProducts(); loadCategories(); }, [loadProducts, loadCategories]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return products;
    return products.filter((product) => `${product.nome} ${product.categoria}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [products, query]);

  async function saveProduct(product) {
    setSaving(true);
    setFormError('');
    try {
      const isEditing = Boolean(editingProduct);
      await apiRequest(isEditing ? `atualizar/${encodeURIComponent(editingProduct.id)}` : 'cadastro', {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(product)
      });
      setDialogOpen(false);
      setEditingProduct(null);
      setNoticeError(false);
      setNotice(isEditing ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.');
      await Promise.all([loadProducts(), loadCategories()]);
    } catch (err) {
      setFormError(err.message || 'Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Excluir "${product.nome}" do catálogo?`)) return;
    setNotice('');
    try {
      await apiRequest(`excluir/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      setNoticeError(false);
      setNotice('Produto excluído com sucesso.');
      await Promise.all([loadProducts(), loadCategories()]);
    } catch (err) {
      setNoticeError(true);
      setNotice(err.message || 'Não foi possível excluir o produto.');
    }
  }

  function openDialog(product = null) {
    setEditingProduct(product);
    setFormError('');
    setDialogOpen(true);
  }

  async function registerMovement(event) {
    event.preventDefault();
    setMovementBusy(true);
    setMovementError('');
    setMovementMessage('');
    try {
      await apiRequest('registro', {
        method: 'POST',
        body: JSON.stringify({
          id_produto: Number(movement.id_produto),
          tipo: movement.tipo,
          quantidade: Number(movement.quantidade),
          tempo: `${movement.tempo.replace('T', ' ')}:00`
        })
      });
      setMovementMessage('Movimentação registrada com sucesso.');
      setMovement({ ...movement, quantidade: '', tempo: localDateTime() });
      await Promise.all([loadProducts(), loadCategories()]);
    } catch (err) {
      setMovementError(err.message || 'Não foi possível registrar a movimentação.');
    } finally {
      setMovementBusy(false);
    }
  }

  async function loadReports(event) {
    event.preventDefault();
    setReportBusy(true);
    setReportError('');
    try {
      const payload = { dataInicial: period.start, dataFinal: `${period.end} 23:59:59` };
      const [periodData, topExits, thresholdData] = await Promise.all([
        apiRequest('relatorio-periodo', { method: 'POST', body: JSON.stringify(payload) }),
        apiRequest('maiores-saidas', { method: 'POST', body: JSON.stringify(payload) }),
        apiRequest('porcentagem', { method: 'POST', body: JSON.stringify({ limite_minimo: Number(limits.min), limite_maximo: Number(limits.max) }) })
      ]);
      setReports({ period: periodData, topExits, threshold: thresholdData });
    } catch (err) {
      setReportError(err.message || 'Não foi possível gerar os relatórios.');
    } finally {
      setReportBusy(false);
    }
  }

  const selectedView = views.find((view) => view.id === activeView);
  const title = { overview: 'Visão geral', products: 'Produtos', movements: 'Movimentações', reports: 'Relatórios' }[activeView];
  const subtitle = {
    overview: 'Acompanhe o resumo e a distribuição do seu estoque.',
    products: 'Cadastre e mantenha seu catálogo atualizado.',
    movements: 'Registre entradas e saídas vinculadas aos produtos.',
    reports: 'Analise movimentações e níveis de estoque.'
  }[activeView];

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Menu do sistema">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActiveView('overview'); }}><span className="brand-mark"><Icon name="box" size={21} /></span><span>estoque<span className="brand-dot">.</span></span></a>
        <div className="sidebar-section-label">MENU PRINCIPAL</div>
        <nav className="navigation" aria-label="Navegação principal">{views.map((view) => <button type="button" key={view.id} aria-current={activeView === view.id ? 'page' : undefined} className={`nav-item ${activeView === view.id ? 'active' : ''}`} onClick={() => { setActiveView(view.id); setNotice(''); }}><Icon name={view.icon} size={18} /><span>{view.label}</span>{view.id === 'products' && <span className="nav-count" aria-label={`${products.length} produtos`}>{products.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-avatar">E</div><div className="sidebar-user"><strong>Equipe</strong><span>Gestão de estoque</span></div><span className="online-dot" title="Interface ativa" /></div>
      </aside>

      <section className="main-content">
        <AmbientBackground />
        <header className="topbar"><div className="breadcrumb" aria-label={`Localização: Painel, ${selectedView?.label}`}><span className="breadcrumb-root">Painel</span><span aria-hidden="true">/</span><strong>{selectedView?.label}</strong></div><div className="topbar-actions"><div className="theme-switch" role="group" aria-label="Escolha o tema da interface"><button type="button" className="theme-option" aria-label="Tema claro" aria-pressed={theme === 'light'} onClick={() => selectTheme('light')}><Icon name="sun" size={16} /><span>Claro</span></button><button type="button" className="theme-option" aria-label="Tema escuro" aria-pressed={theme === 'dark'} onClick={() => selectTheme('dark')}><Icon name="moon" size={16} /><span>Escuro</span></button></div><div className={`system-status ${apiOnline === false ? 'status-offline' : apiOnline ? 'status-online' : 'status-pending'}`} role="status" aria-live="polite"><i /> <span>{apiOnline === null ? 'Conectando à API' : apiOnline ? 'API disponível' : 'API indisponível'}</span></div></div></header>
        <div className="page-content">
          <div className="page-heading"><div><span className="eyebrow">GESTÃO DE ESTOQUE</span><h1>{title}</h1><p>{subtitle}</p></div>{activeView === 'products' && <button className="button button-primary add-button" onClick={() => openDialog()}><Icon name="plus" size={17} /> Adicionar produto</button>}</div>
          {error && <div className="notice notice-error" role="alert"><span>{error}</span><button className="button button-quiet retry-button" onClick={loadProducts}>Tentar novamente</button></div>}
          {notice && <div className={`notice ${noticeError ? 'notice-error' : 'notice-success'}`} role={noticeError ? 'alert' : 'status'}><span>{notice}</span><button className="notice-close" aria-label="Fechar aviso" onClick={() => setNotice('')}>×</button></div>}

          {loading ? <div className="loading-panel" role="status" aria-live="polite"><span className="spinner" /> Carregando dados do estoque...</div> : activeView === 'overview' ? (
            <Overview products={products} categories={categories} onNavigate={setActiveView} onEdit={openDialog} onDelete={deleteProduct} categoryError={categoryError} />
          ) : activeView === 'products' ? (
            <section className="panel">
              <div className="panel-heading"><div><span className="eyebrow">CATÁLOGO</span><h2>Todos os produtos</h2><p>{filteredProducts.length} de {products.length} produtos</p></div><label className="search-form"><Icon name="search" size={17} /><input aria-label="Buscar produto" placeholder="Buscar nome ou categoria..." value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" className="clear-search" aria-label="Limpar busca" onClick={() => setQuery('')}>×</button>}</label></div>
              <ProductTable products={filteredProducts} onEdit={openDialog} onDelete={deleteProduct} />
            </section>
          ) : activeView === 'movements' ? (
            <section className="panel movement-panel">
              <div className="panel-heading"><div><span className="eyebrow">REGISTRO DE ESTOQUE</span><h2>Nova movimentação</h2><p>Informe o produto, o tipo e a quantidade movimentada.</p></div><span className="panel-icon large"><Icon name="swap" size={21} /></span></div>
              {movementMessage && <div className="notice notice-success" role="status">{movementMessage}</div>}
              {movementError && <div className="notice notice-error" role="alert">{movementError}</div>}
              <form className="movement-form" onSubmit={registerMovement}>
                <label>Produto<select required value={movement.id_produto} onChange={(event) => setMovement({ ...movement, id_produto: event.target.value })}><option value="">Selecione um produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.nome} — {product.quantidade} un.</option>)}</select></label>
                <label>Tipo de movimentação<select value={movement.tipo} onChange={(event) => setMovement({ ...movement, tipo: event.target.value })}><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label>
                <label>Quantidade<input required type="number" min="0.01" step="any" value={movement.quantidade} onChange={(event) => setMovement({ ...movement, quantidade: event.target.value })} placeholder="Ex.: 10" /></label>
                <label>Data e hora<input required type="datetime-local" value={movement.tempo} onChange={(event) => setMovement({ ...movement, tempo: event.target.value })} /></label>
                <div className="form-submit"><button className="button button-primary" type="submit" disabled={movementBusy || !products.length}>{movementBusy ? 'Registrando...' : 'Registrar movimentação'} <Icon name="arrow" size={16} /></button></div>
              </form>
              {!products.length && <p className="form-hint">Cadastre um produto antes de registrar uma movimentação.</p>}
            </section>
          ) : (
            <section className="panel reports-panel">
              <div className="panel-heading"><div><span className="eyebrow">ANÁLISE</span><h2>Relatórios de estoque</h2><p>Consulte movimentações por período e produtos fora dos limites.</p></div><span className="panel-icon large"><Icon name="chart" size={21} /></span></div>
              <form className="report-form" onSubmit={loadReports}>
                <div className="report-fieldset"><strong>Período de movimentação</strong><div className="form-row"><label>Data inicial<input required type="date" value={period.start} onChange={(event) => setPeriod({ ...period, start: event.target.value })} /></label><label>Data final<input required type="date" min={period.start} value={period.end} onChange={(event) => setPeriod({ ...period, end: event.target.value })} /></label></div></div>
                <div className="report-fieldset"><strong>Limites de quantidade</strong><div className="form-row"><label>Limite mínimo<input required type="number" min="0" step="1" value={limits.min} onChange={(event) => setLimits({ ...limits, min: event.target.value })} /></label><label>Limite máximo<input required type="number" min="1" step="1" value={limits.max} onChange={(event) => setLimits({ ...limits, max: event.target.value })} /></label></div><span className="form-hint">Inclui produtos com quantidade menor ou igual ao mínimo, ou maior ou igual ao máximo.</span></div>
                {reportError && <p className="form-error" role="alert">{reportError}</p>}
                <button className="button button-primary" type="submit" disabled={reportBusy}>{reportBusy ? 'Gerando relatórios...' : 'Gerar relatórios'} <Icon name="arrow" size={16} /></button>
              </form>
              {reports && <div className="report-results">
                <section className="report-block"><div className="report-title"><h3>Resumo do período</h3><span>{reports.period.length} produtos</span></div><div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>ENTRADAS</th><th>SAÍDAS</th><th>SALDO DO PERÍODO</th></tr></thead><tbody>{reports.period.length ? reports.period.map((item) => <tr key={item.nome}><td><strong>{item.nome}</strong></td><td>{Number(item.total_entradas || 0).toLocaleString('pt-BR')}</td><td>{Number(item.total_saidas || 0).toLocaleString('pt-BR')}</td><td>{Number(item.saldo_periodo || 0).toLocaleString('pt-BR')}</td></tr>) : <tr><td colSpan="4" className="table-empty">Sem movimentações no período selecionado.</td></tr>}</tbody></table></div></section>
                <section className="report-block"><div className="report-title"><h3>Maiores saídas</h3><span>{reports.topExits.length} produtos</span></div><div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>QUANTIDADE RETIRADA</th><th>VALOR TOTAL</th></tr></thead><tbody>{reports.topExits.length ? reports.topExits.slice(0, 5).map((item) => <tr key={item.nome}><td><strong>{item.nome}</strong></td><td>{Number(item.quantidade_total_saida || 0).toLocaleString('pt-BR')}</td><td>{Number(item.valor_total_financeiro_saida || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>) : <tr><td colSpan="3" className="table-empty">Sem saídas no período selecionado.</td></tr>}</tbody></table></div></section>
                <section className="report-block"><div className="report-title"><h3>Produtos nos limites informados</h3><span>{reports.threshold.produtos_no_limite?.length || 0} produtos</span></div><div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>QUANTIDADE</th><th>PERCENTUAL ATINGIDO</th></tr></thead><tbody>{reports.threshold.produtos_no_limite?.length ? reports.threshold.produtos_no_limite.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong></td><td>{item.categoria}</td><td>{Number(item.quantidade).toLocaleString('pt-BR')}</td><td>{Number(item.percentual_atingido).toLocaleString('pt-BR')}%</td></tr>) : <tr><td colSpan="4" className="table-empty">Nenhum produto está nos limites informados.</td></tr>}</tbody></table></div></section>
              </div>}
            </section>
          )}
          <footer className="page-footer">Dados sincronizados com a API de estoque.</footer>
        </div>
      </section>
      {dialogOpen && <ProductDialog product={editingProduct} onClose={() => { setDialogOpen(false); setEditingProduct(null); }} onSave={saveProduct} saving={saving} error={formError} />}
    </main>
  );
}
