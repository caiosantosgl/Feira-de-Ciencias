// URL do modelo da IA:
const URL = "https://teachablemachine.withgoogle.com/models/-3-2Ngyl-/";

let model, webcam, labelContainer, maxPredictions, barsContainer;
let isWebcamActive = false;
let isPaused = false;
let currentPredictionSource = null;
let currentFacingMode = 'environment'; 

// Limites de Confiança (Mantidos com Maior Tolerância)
const CONFIDENCE_THRESHOLD_SUGGESTION = 0.30; 
const CONFIDENCE_THRESHOLD_CONFIRM = 0.85; 

// Elementos HTML
const webcamVideo = document.getElementById("webcam-video");
const uploadedImage = document.getElementById("uploaded-image");
const webcamButton = document.getElementById("webcamButton");
const toggleCameraButton = document.getElementById("toggleCameraButton");
const frozenImage = document.getElementById("frozen-image");

// ----------------------------------------------------
// Funções de Inicialização e Controle de Câmera (Estáveis)
// ----------------------------------------------------

async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        labelContainer = document.getElementById("label-container");
        barsContainer = document.getElementById("bars-container");
        toggleCameraButton.disabled = true; 
    } catch (e) {
        document.getElementById("label-container").innerHTML = '<p class="disposal-inconclusivo" style="color: red;">Erro ao carregar o modelo de IA. Verifique a URL do modelo.</p>';
        console.error("Erro ao carregar o modelo de IA:", e);
    }
}

async function startWebcam() {
    if (!model) {
        labelContainer.innerHTML = '<p style="color: red;">Modelo de IA não carregado. Verifique a URL do modelo no script.js.</p>';
        return;
    }

    if (isWebcamActive) {
        if (isPaused) {
            resumeWebcam();
        } else {
            pauseWebcam();
        }
        return;
    }

    uploadedImage.style.display = 'none';
    frozenImage.style.display = 'none';
    const width = 400;
    const height = 400;
    const flip = true;

    try {
        const webcamSettings = { facingMode: currentFacingMode };
        webcam = new tmImage.Webcam(width, height, flip, webcamSettings);

        await webcam.setup();
        await webcam.play();

    } catch (e) {
        console.error("Erro grave ao iniciar a webcam:", e);
        labelContainer.innerHTML = '<div class="disposal-inconclusivo">❌ Erro de Acesso! Verifique as **permissões da câmera** e se o dispositivo não está em uso por outro programa.</div>';
        return;
    }

    document.getElementById("prediction-area").prepend(webcam.canvas);
    webcam.canvas.id = "webcam-canvas";
    webcamVideo.style.display = 'none'; 

    isWebcamActive = true;
    isPaused = false;
    currentPredictionSource = 'webcam';
    webcamButton.innerHTML = '<i class="fas fa-pause"></i> Pausar câmera';
    toggleCameraButton.disabled = false;
    window.requestAnimationFrame(loop);
}

function pauseWebcam() {
    if (!isWebcamActive || isPaused) return;

    if (webcam && webcam.canvas) {
        webcam.update();
        const snapshot = webcam.canvas.toDataURL('image/jpeg', 1.0);
        webcam.canvas.style.display = 'none';
        frozenImage.src = snapshot;
        frozenImage.style.display = 'block';
    }

    isPaused = true;
    webcamButton.innerHTML = '<i class="fas fa-play"></i> ▶️Despausar';
    labelContainer.innerHTML = '<p class="initial-message" style="color: #007bff;">⏸️ Câmera Pausada</p>';
}

async function resumeWebcam() {
    if (!isWebcamActive || !isPaused) return;

    frozenImage.style.display = 'none';
    frozenImage.src = '';

    const canvas = document.getElementById("webcam-canvas");
    if (canvas) {
        canvas.style.display = 'block';
    }

    isPaused = false;
    webcamButton.innerHTML = '<i class="fas fa-pause"></i> Pausar câmera';
    window.requestAnimationFrame(loop);
}

async function stopWebcam() {
    if (webcam) {
        webcam.stop();
        if (webcam.webcam.srcObject) {
            webcam.webcam.srcObject.getTracks().forEach(track => track.stop());
            webcam.webcam.srcObject = null;
        }
    }
    
    const canvas = document.getElementById("webcam-canvas");
    if (canvas) {
        canvas.remove();
    }

    webcamVideo.style.display = 'none';
    uploadedImage.style.display = 'none';
    frozenImage.style.display = 'none';
    frozenImage.src = '';

    isWebcamActive = false;
    isPaused = false;
    currentPredictionSource = null;
    toggleCameraButton.disabled = true;

    webcamButton.innerHTML = '<i class="fas fa-video"></i> Iniciar câmera';
    labelContainer.className = 'result-box';
    labelContainer.innerHTML = '<p class="initial-message">Aguardando...</p>';
    barsContainer.innerHTML = '';
}

async function toggleCameraDirection() {
    if (!isWebcamActive) return;

    currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';

    await stopWebcam();
    await startWebcam();

    const directionText = (currentFacingMode === 'environment') ? 'Traseira' : 'Frontal';
    toggleCameraButton.innerHTML = `<i class="fas fa-sync-alt"></i> Câmera ${directionText}`;
}

async function loop() {
    if (isWebcamActive && !isPaused && currentPredictionSource === 'webcam') {
        webcam.update(); 
        await predict(webcam.canvas); 
        window.requestAnimationFrame(loop);
    }
}

function handleImageUpload(event) {
    if (!model) { labelContainer.innerHTML = '<p style="color: red;">Modelo de IA não carregado.</p>'; return; }

    if (isWebcamActive) {
        stopWebcam();
        webcamButton.innerHTML = '<i class="fas fa-video"></i> Iniciar câmera';
    }

    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();

        reader.onload = function (e) {
            uploadedImage.src = e.target.result;
            uploadedImage.style.display = 'block';
            webcamVideo.style.display = 'none'; 
            frozenImage.style.display = 'none'; 

            uploadedImage.onload = function () {
                currentPredictionSource = 'image';
                predict(uploadedImage); 
            }

            if (uploadedImage.complete) {
                uploadedImage.onload();
            }
        };
        reader.readAsDataURL(file);
    } else {
        uploadedImage.style.display = 'none';
        labelContainer.className = 'result-box';
        labelContainer.innerHTML = '<p class="initial-message">Aguardando objeto...</p>';
        barsContainer.innerHTML = '';
    }
}


// ----------------------------------------------------
// Funções de Descarte e Predição (Mapeamento Reforçado)
// ----------------------------------------------------

function getDisposalInfo(className) {
    const lowerCaseName = className.toLowerCase().trim();

    // Dicionário de Mapeamento Reforçado: 
    // Usado para garantir que classes confusas ou ambíguas sejam mapeadas corretamente.

    // 1. **PAPEL/PAPELÃO (AZUL):** Prioriza rótulos que o modelo confunde com metal (Tetra Pak)
    const paperLabels = ["papel", "papelao", "leite", "caixa", "embalagem", "jornal", "revista", "caixas"];
    if (paperLabels.some(label => lowerCaseName.includes(label))) {
        return { 
            className: "disposal-papel", 
            barClass: "bar-papel", 
            material: "Papel/Papelão", 
            color: "AZUL", 
            icon: "fas fa-file-alt", 
            instrucao: "Embalagens Tetra Pak e papel/papelão limpos. Não descarte papéis sujos." 
        };
    }

    // 2. **PLÁSTICO (VERMELHA):** Inclui a classe "plástico" e as classes de lixo comum/não reciclável para forçar o descarte na lixeira VERMELHA, conforme sua lógica original.
    const plasticLabels = ["plástico", "pote", "garrafa", "sacola", "nao reciclav", "lixo comum", "outros lixos", "rejeito"];
    if (plasticLabels.some(label => lowerCaseName.includes(label))) {
        return {
            className: "disposal-plastico",
            barClass: "bar-plastico",
            material: "Plástico",
            color: "VERMELHA",
            icon: "fas fa-recycle",
            instrucao: "Lave e seque. Não descarte plásticos com resíduos tóxicos. Lixo Comum/Rejeito deve ir na lixeira VERMELHA (Plástico) ou CINZA (depende da prefeitura)."
        };
    }

    // 3. **METAL (AMARELA):** const metalLabels = ["metal", "metais", "lata", "latinha", "ferro", "aluminio"];
    if (metalLabels.some(label => lowerCaseName.includes(label))) {
        return { 
            className: "disposal-metal", 
            barClass: "bar-metais", 
            material: "Metal", 
            color: "AMARELA", 
            icon: "fas fa-cogs", 
            instrucao: "Lave as latas e amasse. Cuidado com objetos pontiagudos." 
        };
    }
    
    // 4. **VIDRO (VERDE):**
    const glassLabels = ["vidro", "garrafa", "pote", "copo"];
    if (glassLabels.some(label => lowerCaseName.includes(label))) {
        return { 
            className: "disposal-vidro", 
            barClass: "bar-vidro", 
            material: "Vidro", 
            color: "VERDE", 
            icon: "fas fa-glass-martini", 
            instrucao: "Descarte com segurança, em caixas ou embrulhado em jornal." 
        };
    }

    // 5. **REJEITO/COMUM (Fallback Final)**
    return {
        className: "disposal-comum",
        barClass: "bar-comum",
        material: "Outros Resíduos",
        color: "CINZA ou PRETA",
        icon: "fas fa-trash-alt",
        instrucao: "Este item não foi identificado ou se enquadra em rejeito (lixo comum/orgânico)."
    };
}

async function predict(imageElement) {
    if (!model) return;

    const prediction = await model.predict(imageElement, false); 

    labelContainer.innerHTML = '';
    labelContainer.className = 'result-box';
    barsContainer.innerHTML = '';

    let topPrediction = { className: "Não Identificado", probability: 0 };

    // 1. Cria as Barras e encontra a maior predição
    prediction.forEach(p => {
        const info = getDisposalInfo(p.className);
        const probabilityPercent = (p.probability * 100).toFixed(0);

        const rowHTML = `
            <div class="prediction-row">
                <div class="class-label">${info.material}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar ${info.barClass}" style="width: ${probabilityPercent}%;">
                        ${probabilityPercent}%
                    </div>
                </div>
            </div>
        `;
        barsContainer.innerHTML += rowHTML;

        if (p.probability > topPrediction.probability) {
            topPrediction = p;
        }
    });

    // 2. Geração da Mensagem Principal
    const resultDiv = document.createElement("div");
    const topInfo = getDisposalInfo(topPrediction.className);
    const probability = topPrediction.probability;

    // Garante que o contêiner receba a classe de descarte correta do item de maior probabilidade
    labelContainer.classList.add(topInfo.className);

    let messageHTML = '';
    let headerText = '';
    let headerStyle = '';

    if (probability >= CONFIDENCE_THRESHOLD_CONFIRM) {
        // NÍVEL 1: Acima de 85% (Confirmação)
        headerText = `✅Indentificado: ${topInfo.material}`;
        headerStyle = `style="color: var(--color-vidro); font-size: 1.7em;"`;
        messageHTML = `
            <p class="disposal-text" style="font-size: 1.2em; font-weight: 700; border-top: 1px dashed #ccc; padding-top: 10px;">
                <i class="fas fa-trash"></i> Descarte na Lixeira: **${topInfo.color}**
            </p>
            <p style="font-size: 0.8em; color: #666; margin-top: 5px;">
                Dica: ${topInfo.instrucao}
            </p>
        `;

    } else if (probability >= CONFIDENCE_THRESHOLD_SUGGESTION) {
        // NÍVEL 2: Entre 30% e 84% (Sugestão Amigável)
        headerText = `❎Acredito que seja: ${topInfo.material}`;
        headerStyle = `style="color: var(--color-secondary); font-size: 1.7em;"`;
        messageHTML = `
            <p class="disposal-text" style="font-size: 1.2em; font-weight: 700; border-top: 1px dashed #ccc; padding-top: 10px;">
                <i class="fas fa-hand-point-right"></i> Sugiro Lixeira: **${topInfo.color}**
            </p>
            <p style="font-size: 0.8em; color: #666; margin-top: 5px;">
                Dica: ${topInfo.instrucao}
            </p>
        `;
    } else {
        // NÍVEL 3: Abaixo de 30% (Fallback Otimizado)
        const fallbackInfo = getDisposalInfo("Outros Lixos"); 
        
        headerText = `❓Não tenho certeza: ${topInfo.material}`;
        headerStyle = `style="color: var(--color-comum); font-size: 1.7em;"`;
        messageHTML = `
            <p class="disposal-text" style="font-size: 1.1em; font-weight: 600;">
                <i class="fas fa-search-plus"></i> **Resultado Inconclusivo**. Tente o Modo Upload ou aproxime o objeto.
            </p>
            <p style="font-size: 0.8em; color: #666; margin-top: 5px;">
                A sugestão mais alta da IA foi **${topInfo.material}** (${(probability * 100).toFixed(0)}%).
            </p>
        `;
        // Ajusta a classe do contêiner para a cor de inconclusivo
        labelContainer.classList.remove(topInfo.className);
        labelContainer.classList.add(fallbackInfo.className);
    }

    // Montagem final do resultado
    resultDiv.innerHTML = `
        <p class="result-header" style="font-size: 1.0em; margin-bottom: 0;">
            <i class="${topInfo.icon}"></i> Confiança: **${(topPrediction.probability * 100).toFixed(0)}%**
        </p>
        <h3 class="result-header" ${headerStyle}>
            ${headerText}
        </h3>
        ${messageHTML}
    `;

    labelContainer.appendChild(resultDiv);
}

// Inicia o carregamento do modelo
window.onload = init;
