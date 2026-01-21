const NexusApp = {
    state: {
        movimientos: [],
        tabActual: 'movimientos',
        idActivo: null,
        filtroBusqueda: '',
        editandoId: null,
        saldosActuales: { ARS: 0, USD: 0 }
    },

    init() {
        this.cacheDOM();
        this.loadData();
        this.setDefaultDate();
        this.initListeners();
        this.renderAll();
    },

    cacheDOM() {
        this.dom = {
            cajaARS: document.getElementById('cajaReal'), cajaUSD: document.getElementById('cajaRealUSD'),
            deudaARS: document.getElementById('deudaARS'), deudaUSD: document.getElementById('deudaUSD'),
            historial: document.getElementById('historial'), desc: document.getElementById('desc'),
            monto: document.getElementById('monto'), fecha: document.getElementById('fechaManual'),
            tipo: document.getElementById('tipo'), divisa: document.getElementById('divisaRegistro'),
            estado: document.getElementById('estadoInicial'), busqueda: document.getElementById('busqueda'),
            ctxMenu: document.getElementById('custom-context-menu'), ctxList: document.getElementById('ctx-list'),
            panelTitle: document.getElementById('panelTitle'), btnGuardar: document.getElementById('btnGuardar'),
            btnCancel: document.getElementById('btnCancelarEdit'),
            alertaContenedor: document.getElementById('alertaContenedor')
        };
    },

    setDefaultDate() {
        const hoy = new Date().toISOString().split('T')[0];
        this.dom.fecha.value = hoy;
        if(document.getElementById('presFecha')) document.getElementById('presFecha').value = hoy;
    },

    loadData() {
        this.state.movimientos = JSON.parse(localStorage.getItem('nexus_gold_v2_data')) || [];
    },

    initListeners() {
        window.addEventListener('click', () => this.dom.ctxMenu.classList.add('hidden'));
        window.addEventListener('contextmenu', (e) => {
            const item = e.target.closest('.history-item');
            if (item) {
                e.preventDefault();
                this.state.idActivo = parseInt(item.dataset.id);
                this.renderContextMenu(e.pageX, e.pageY);
            }
        });
        this.dom.busqueda.addEventListener('input', (e) => {
            this.state.filtroBusqueda = e.target.value.toLowerCase();
            this.renderHistorial();
        });
    },

    renderContextMenu(x, y) {
        const mov = this.state.movimientos.find(m => m.id === this.state.idActivo);
        if(!mov) return;
        let html = `<li onclick="NexusApp.prepararEdicion(${mov.id})" class="text-blue-400"><i class="fas fa-edit"></i> EDITAR</li>
                    <li onclick="NexusApp.eliminarRegistro()" class="text-red-400"><i class="fas fa-trash"></i> BORRAR</li>`;
        if(mov.estado === 'adeudado') {
            html = `<li onclick="NexusApp.abrirPagoParcial(${mov.id})" class="text-green-400 font-bold"><i class="fas fa-check"></i> ABONAR/LIQUIDAR</li>` + html;
        }
        this.dom.ctxList.innerHTML = html;
        this.dom.ctxMenu.style.top = `${y}px`;
        this.dom.ctxMenu.style.left = `${x}px`;
        this.dom.ctxMenu.classList.remove('hidden');
    },

    guardarRegistro() {
        const d = this.dom.desc.value, m = parseFloat(this.dom.monto.value), f = this.dom.fecha.value;
        const tipo = this.dom.tipo.value, divisa = this.dom.divisa.value, estado = this.dom.estado.value;
        
        if(!d || isNaN(m) || !f) return;

        // VALIDACIÓN DE SALDO PARA GASTOS PAGADOS
        if(tipo === 'gasto' && estado === 'pagado') {
            const saldoDisponible = this.state.saldosActuales[divisa];
            if(m > saldoDisponible) {
                alert(`SALDO INSUFICIENTE: Tienes ${saldoDisponible.toLocaleString()} y quieres gastar ${m.toLocaleString()}`);
                return;
            }
        }

        if (this.state.editandoId) {
            const idx = this.state.movimientos.findIndex(x => x.id === this.state.editandoId);
            this.state.movimientos[idx] = { ...this.state.movimientos[idx], desc: d.toUpperCase(), monto: m, tipo: tipo, divisa: divisa, estado: estado, fecha: f };
            this.cancelarEdicion();
        } else {
            this.state.movimientos.push({ id: Date.now(), desc: d.toUpperCase(), monto: m, tipo: tipo, divisa: divisa, estado: estado, fecha: f, esPrestamo: false });
        }
        this.dom.desc.value = ''; this.dom.monto.value = '';
        this.sync();
    },

    registrarPrestamo() {
        const n = document.getElementById('presNombre').value.toUpperCase();
        const m = parseFloat(document.getElementById('presMonto').value);
        const f = document.getElementById('presFecha').value;
        const tipo = document.getElementById('presTipo').value;
        const divisa = document.getElementById('presDivisa').value;

        if(!n || isNaN(m)) return;

        if(tipo === 'gasto' && m > this.state.saldosActuales[divisa]) {
            alert(`Saldo insuficiente en caja para prestar.`);
            return;
        }

        this.state.movimientos.push({ 
            id: Date.now(), desc: `PRÉSTAMO: ${n}`, contacto: n, monto: m, 
            tipo: tipo, divisa: divisa, estado: 'adeudado', fecha: f, esPrestamo: true 
        });
        this.cerrarModal('modalPrestamo');
        this.sync();
    },

    abrirPagoParcial(id) {
        this.state.idActivo = id;
        const mov = this.state.movimientos.find(m => m.id === id);
        document.getElementById('pagoParcialInfo').innerText = `${mov.desc} (Deuda actual: ${mov.divisa} ${mov.monto.toLocaleString()})`;
        document.getElementById('montoPagoParcial').value = mov.monto;
        this.abrirModal('modalPagoParcial');
    },

    confirmarPagoParcial() {
        const montoAPagar = parseFloat(document.getElementById('montoPagoParcial').value);
        const movOriginal = this.state.movimientos.find(m => m.id === this.state.idActivo);
        
        if (!movOriginal || isNaN(montoAPagar) || montoAPagar <= 0) return;

        // VALIDACIÓN CRÍTICA: ¿Hay dinero en caja para este abono?
        // Si la deuda original es un "gasto" pendiente, pagarla requiere "dinero real" (egreso).
        const saldoEnCaja = this.state.saldosActuales[movOriginal.divisa];
        if (montoAPagar > saldoEnCaja) {
            alert(`PAGO RECHAZADO: No hay fondos suficientes en Caja ${movOriginal.divisa}. Disponible: ${saldoEnCaja.toLocaleString()}`);
            return; // BLOQUEO TOTAL
        }

        // REGISTRO DEL MOVIMIENTO DE CAJA (EGRESO REAL)
        this.state.movimientos.push({
            id: Date.now() + 1, 
            desc: `PAGO: ${movOriginal.desc}`, 
            monto: montoAPagar,
            tipo: 'gasto', // SIEMPRE ES GASTO PORQUE SALE DINERO DE TU MANO
            divisa: movOriginal.divisa, 
            estado: 'pagado', 
            fecha: new Date().toISOString().split('T')[0],
            vinculoId: movOriginal.id 
        });

        // ACTUALIZACIÓN DE LA DEUDA
        if (montoAPagar >= movOriginal.monto) { 
            movOriginal.monto = 0;
            movOriginal.estado = 'pagado'; 
            movOriginal.esPrestamo = false; 
        } else { 
            movOriginal.monto -= montoAPagar; 
        }

        this.cerrarModal('modalPagoParcial');
        this.sync();
    },

    eliminarRegistro() {
        if(!confirm("¿Eliminar registro?")) return;
        const movAEliminar = this.state.movimientos.find(m => m.id === this.state.idActivo);
        
        if(movAEliminar && movAEliminar.vinculoId) {
            const deudaPadre = this.state.movimientos.find(m => m.id === movAEliminar.vinculoId);
            if(deudaPadre) {
                deudaPadre.monto += movAEliminar.monto;
                deudaPadre.estado = 'adeudado';
                if(deudaPadre.desc.includes("PRÉSTAMO")) deudaPadre.esPrestamo = true;
            }
        }

        this.state.movimientos = this.state.movimientos.filter(m => m.id !== this.state.idActivo);
        this.sync();
    },

    renderStats() {
        let ars = 0, usd = 0, dARS = 0, dUSD = 0;
        this.state.movimientos.forEach(m => {
            // Dinero Real (Pagado o Préstamos iniciales que mueven caja)
            if (m.estado === 'pagado' || m.esPrestamo) {
                if (m.divisa === 'ARS') {
                    m.tipo === 'ingreso' ? ars += m.monto : ars -= m.monto;
                } else {
                    m.tipo === 'ingreso' ? usd += m.monto : usd -= m.monto;
                }
            }
            // Deudas (Solo lo que está pendiente)
            if (m.estado === 'adeudado') {
                if (m.divisa === 'ARS') dARS += m.monto; else dUSD += m.monto;
            }
        });
        
        this.state.saldosActuales.ARS = ars;
        this.state.saldosActuales.USD = usd;

        this.dom.cajaARS.innerText = `$ ${ars.toLocaleString()}`;
        this.dom.cajaUSD.innerText = `u$s ${usd.toLocaleString()}`;
        this.dom.deudaARS.innerText = `$ ${dARS.toLocaleString()}`;
        this.dom.deudaUSD.innerText = `u$s ${dUSD.toLocaleString()}`;
    },

    renderHistorial() {
        let filtrados = this.state.tabActual === 'prestamos' ? this.state.movimientos.filter(m => m.estado === 'adeudado') : this.state.movimientos;
        if (this.state.filtroBusqueda) filtrados = filtrados.filter(m => m.desc.toLowerCase().includes(this.state.filtroBusqueda));
        const hoy = new Date().toISOString().split('T')[0];
        this.dom.historial.innerHTML = filtrados.sort((a,b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).map(m => `
            <div class="history-item ${m.estado === 'adeudado' ? 'item-debt' : 'item-paid'}" data-id="${m.id}">
                <div>
                    <p class="text-[10px] font-black uppercase flex items-center gap-2">${m.desc} ${m.fecha > hoy ? '<i class="fas fa-clock text-blue-400"></i>' : ''}</p>
                    <p class="text-[8px] opacity-30 font-bold">${m.fecha.split('-').reverse().join('/')} ${m.estado === 'adeudado' ? '• PENDIENTE' : '• CERRADO'}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-black text-[11px] ${m.tipo === 'ingreso' ? 'text-green-400' : 'text-red-400'}">
                        ${m.tipo === 'ingreso' ? '+' : '-'} ${m.divisa === 'USD' ? 'u$s' : '$'} ${m.monto.toLocaleString()}
                    </span>
                    <div class="flex gap-1 ml-2 pl-2 border-l border-white/5">
                        <button onclick="NexusApp.prepararEdicion(${m.id})" class="mini-action-btn text-blue-400"><i class="fas fa-edit"></i></button>
                        ${m.estado === 'adeudado' ? `<button onclick="NexusApp.abrirPagoParcial(${m.id})" class="mini-action-btn text-green-400"><i class="fas fa-check"></i></button>` : ''}
                        <button onclick="NexusApp.state.idActivo=${m.id}; NexusApp.eliminarRegistro()" class="mini-action-btn text-red-400"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`).join('') || '<div class="opacity-10 py-10 text-center text-xs">SIN MOVIMIENTOS</div>';
    },

    // ... resto de funciones de UI (prepararEdicion, cancelarEdicion, sync, renderAll, cambiarTab, abrirModal, cerrarModal)
    verificarVencimientos() {
        const mañana = new Date(); mañana.setDate(mañana.getDate() + 1);
        const mañanaISO = mañana.toISOString().split('T')[0];
        const deudasMañana = this.state.movimientos.filter(m => m.estado === 'adeudado' && m.fecha === mañanaISO);
        if (deudasMañana.length > 0) {
            let totalARS = deudasMañana.filter(d => d.divisa === 'ARS').reduce((acc, curr) => acc + curr.monto, 0);
            this.dom.alertaContenedor.innerHTML = `<div class="alerta-vencimiento animate-pulse"><span class="text-[9px] font-black uppercase text-white">Mañana vencen: $ ${totalARS.toLocaleString()}</span></div>`;
        } else { this.dom.alertaContenedor.innerHTML = ''; }
    },
    prepararEdicion(id) {
        const mov = this.state.movimientos.find(m => m.id === id);
        if (!mov) return;
        this.state.editandoId = id;
        this.dom.desc.value = mov.desc; this.dom.monto.value = mov.monto;
        this.dom.fecha.value = mov.fecha; this.dom.tipo.value = mov.tipo;
        this.dom.divisa.value = mov.divisa; this.dom.estado.value = mov.estado;
        this.dom.panelTitle.innerText = "MODO EDICIÓN";
        this.dom.btnGuardar.innerText = "ACTUALIZAR";
        this.dom.btnCancel.classList.remove('hidden');
    },
    cancelarEdicion() {
        this.state.editandoId = null;
        this.dom.panelTitle.innerText = "Consola de Registro";
        this.dom.btnGuardar.innerText = "REGISTRAR";
        this.dom.btnCancel.classList.add('hidden');
        this.dom.desc.value = ''; this.dom.monto.value = ''; this.setDefaultDate();
    },
    sync() { localStorage.setItem('nexus_gold_v2_data', JSON.stringify(this.state.movimientos)); this.renderAll(); },
    renderAll() { this.renderStats(); this.renderHistorial(); this.verificarVencimientos(); },
    cambiarTab(t) { this.state.tabActual = t; document.querySelectorAll('.tab-btn-modern').forEach(b => b.classList.toggle('active', b.id === `tab-nav-${t}`)); this.renderAll(); },
    abrirModal(id) { document.getElementById(id).style.display = 'flex'; },
    cerrarModal(id) { document.getElementById(id).style.display = 'none'; }
};
document.addEventListener('DOMContentLoaded', () => NexusApp.init());
