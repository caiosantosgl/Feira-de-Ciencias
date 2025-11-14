// URL do modelo da IA (Mantida):
const URL = "https://teachablemachine.withgoogle.com/models/-3-2Ngyl-/";

let model, webcam, labelContainer, maxPredictions, barsContainer;
let isWebcamActive = false;
let isPaused = false;
let currentPredictionSource = null;
let currentFacingMode = 'environment'; // Padrão: 'environment' (traseira)

// Limites de Confiança
const CONFIDENCE_THRESHOLD_SUGGESTION = 0.40; // 40% para "Eu acredito que seja..."
const CONFIDENCE_THRESHOLD_CONFIRM = 0.85; // 85% para certeza total

// Elementos HTML
const webcamVideo = document.getElementById("webcam-video");
const uploadedImage = document.getElementById("uploaded-image");
const webcamButton = document.getElementById("webcamButton");
const toggleCameraButton = document.getElementById("toggleCameraButton");
const frozenImage = document.getElementById("frozen-image");

// ----------------------------------------------------
// Funções de Inicialização e Controle de Câmera
// ----------------------------------------------------

async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        labelContainer = document.getElementById("label-container");
        barsContainer = document.getElementById("bars-container");
    } catch (e) {
        document.getElementById("label-container").innerHTML = '<p class="disposal-inconclusivo" style="color: red;">Erro ao carregar o modelo de IA. Verifique a URL.</p>';
        console.error("Erro ao carregar o modelo de IA:", e);
    }
}

async function startWebcam() {
    // 1. Verifica se o modelo está carregado 
    if (!model) {
        labelContainer.innerHTML = '<p style="color: red;">Modelo de IA não carregado. Verifique a URL do modelo no script.js.</p>';
        return;
    }

    // 2. Lógica de clique (Pausa/Resumo)
    if (isWebcamActive) {
        if (isPaused) {
            resumeWebcam();
        } else {
            pauseWebcam();
        }
        return;
    }

    // 3. Inicializa a Webcam
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

    // Sucesso na inicialização
    webcamVideo.style.display = 'block';
    webcamVideo.srcObject = webcam.webcam.srcObject; // Associa a stream ao elemento <video>
    isWebcamActive = true;
    isPaused = false;
    currentPredictionSource = 'webcam';
    webcamButton.innerHTML = '<i class="fas fa-pause"></i> Pausar câmera';
    toggleCameraButton.disabled = false; // Habilita o alternador
    window.requestAnimationFrame(loop); // Inicia o loop
}

// FUNÇÃO CORRIGIDA DE PAUSA: Tira um snapshot e congela a imagem
function pauseWebcam() {
    if (!isWebcamActive || isPaused) return;

    if (webcam && webcam.canvas) {
        webcam.update(); // Garante o último frame

        // Tira um snapshot do canvas
        const snapshot = webcam.canvas.toDataURL('image/jpeg', 1.0);

        // Exibe o snapshot no elemento #frozen-image
        frozenImage.src = snapshot;
        frozenImage.style.display = 'block';

        // Copia o tamanho para o congelamento ficar no lugar certo
        frozenImage.style.width = webcamVideo.clientWidth + 'px'; // Usa clientWidth/Height para o tamanho real
        frozenImage.style.height = webcamVideo.clientHeight + 'px';
    }

    // Esconde o elemento de vídeo ao vivo
    webcamVideo.style.display = 'none';

    // Atualiza o estado para parar o loop
    isPaused = true;
    webcamButton.innerHTML = '<i class="fas fa-play"></i> ▶️Despausar';
    labelContainer.innerHTML = '<p class="initial-message" style="color: #007bff;">⏸️ Câmera Pausada</p>';
}

// FUNÇÃO CORRIGIDA DE RESUMO: Remove o snapshot e reativa o vídeo
async function resumeWebcam() {
    if (!isWebcamActive || !isPaused) return;

    // Esconde o snapshot congelado
    frozenImage.style.display = 'none';
    frozenImage.src = '';

    // Reativa o vídeo ao vivo
    webcamVideo.style.display = 'block';

    // Atualiza o estado e retoma o loop
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

    // Assegura que todos os elementos de visualização sejam escondidos
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

    // 1. Inverte o modo
    currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';

    // 2. Desliga a câmera atual
    await stopWebcam();

    // 3. Reinicia a câmera com o novo modo
    await startWebcam();

    const directionText = (currentFacingMode === 'environment') ? 'Traseira' : 'Frontal';
    toggleCameraButton.innerHTML = `<i class="fas fa-sync-alt"></i> Câmera ${directionText}`;
}

async function loop() {
    // Se a webcam estiver ativa E NÃO pausada, continua a predição
    if (isWebcamActive && !isPaused && currentPredictionSource === 'webcam') {
        webcam.update();
        await predict(webcam.canvas);
        window.requestAnimationFrame(loop);
    }
}

function handleImageUpload(event) {
    if (!model) { labelContainer.innerHTML = '<p style="color: red;">Modelo de IA não carregado.</p>'; return; }

    // Garante que a webcam seja parada e escondida antes de mostrar a imagem
    if (isWebcamActive) {
        stopWebcam();
        webcamButton.innerHTML = '<i class="fas fa-video"></i> Iniciar câmera';
    }

    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();

        reader.onload = function (e) {
            uploadedImage.src = e.target.result;
            uploadedImage.style.display = 'block'; // Mostra a imagem
            webcamVideo.style.display = 'none'; // Esconde o vídeo 
            frozenImage.style.display = 'none'; // Esconde o congelamento

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
// Funções de Descarte e Predição (Mantidas)
// ----------------------------------------------------

function getDisposalInfo(className) {
    const lowerCaseName = className.toLowerCase();

    // ⚠️ ATENÇÃO: Verifique se estes nomes correspondem às classes do seu modelo!
    const plasticForceLabels = ["não reciclável", "lixo comum", "outros lixos", "plástico"];

    // 1. PLÁSTICO (e classes forçadas)
    if (plasticForceLabels.some(label => lowerCaseName.includes(label))) {
        return {
            className: "disposal-plastico",
            barClass: "bar-plastico",
            material: "Plástico",
            color: "VERMELHA",
            icon: "fas fa-recycle",
            instrucao: "Lave e seque antes de descartar. Não descarte plásticos que contenham produtos tóxicos."
        };
    }

    // 2. METAL
    if (lowerCaseName.includes("metal") || lowerCaseName.includes("metais")) {
        return { className: "disposal-metal", barClass: "bar-metais", material: "Metal", color: "AMARELA", icon: "fas fa-cogs", instrucao: "Lave as latas e amasse para otimizar o espaço." };
    }

    // 3. VIDRO
    if (lowerCaseName.includes("vidro")) {
        return { className: "disposal-vidro", barClass: "bar-vidro", material: "Vidro", color: "VERDE", icon: "fas fa-glass-martini", instrucao: "Descarte com segurança em caixas ou embrulhados (não use plástico filme)." };
    }

    // 4. PAPEL
    if (lowerCaseName.includes("papel") || lowerCaseName.includes("papelao")) {
        return { className: "disposal-papel", barClass: "bar-papel", material: "Papel/Papelão", color: "AZUL", icon: "fas fa-file-alt", instrucao: "Não descarte papéis molhados, sujos ou engordurados, eles são rejeitos." };
    }

    // 5. REJEITO/COMUM
    return {
        className: "disposal-comum",
        barClass: "bar-comum",
        material: "Outros Resíduos",
        color: "CINZA ou PRETA",
        icon: "fas fa-trash-alt",
        instrucao: "Este item deve ser descartado como lixo comum (rejeito ou orgânico)."
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

    // 2. Geração da Mensagem Principal (Lógica de Confiança em 3 Níveis)
    const resultDiv = document.createElement("div");
    const topInfo = getDisposalInfo(topPrediction.className);
    const probability = topPrediction.probability;

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
                <i class="fas fa-trash"></i> Descarte na Lixeira: ${topInfo.color}
            </p>
            <p style="font-size: 0.8em; color: #666; margin-top: 5px;">
                Dica: ${topInfo.instrucao}
            </p>
        `;

    } else if (probability >= CONFIDENCE_THRESHOLD_SUGGESTION) {
        // NÍVEL 2: Entre 40% e 84% (Sugestão Amigável)
        headerText = `❎Acredito que seja: ${topInfo.material}`;
        headerStyle = `style="color: var(--color-secondary); font-size: 1.7em;"`;
        messageHTML = `
            <p class="disposal-text" style="font-size: 1.2em; font-weight: 700; border-top: 1px dashed #ccc; padding-top: 10px;">
                <i class="fas fa-hand-point-right"></i> Sugiro Lixeira: ${topInfo.color}
            </p>
            <p style="font-size: 0.8em; color: #666; margin-top: 5px;">
                Dica: ${topInfo.instrucao}
            </p>
        `;
    } else {
        // NÍVEL 3: Abaixo de 40% (Inconclusivo)
        headerText = `❌ Inconclusivo: Apenas ${(probability * 100).toFixed(0)}%`;
        headerStyle = `style="color: var(--color-comum); font-size: 1.7em;"`;
        messageHTML = `
            <p class="disposal-text" style="font-size: 1.1em; font-weight: 600;">
                <i class="fas fa-search-plus"></i> Por favor, aproxime o objeto ou tente o Modo Upload.
            </p>
        `;
    }

    // Montagem final do resultado
    resultDiv.innerHTML = `
        <p class="result-header" style="font-size: 1.0em; margin-bottom: 0;">
            <i class="${topInfo.icon}"></i> Confiança: ${(topPrediction.probability * 100).toFixed(0)}%
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