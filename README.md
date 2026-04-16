# 🥶 FreezAlert - Monitor IoT

**FreezAlert** é um aplicativo mobile desenvolvido em **React Native (Expo)** para monitoramento e controle de dispositivos IoT baseados em ESP32 utilizando o protocolo **MQTT** (via WebSockets).

Este projeto faz parte das atividades acadêmicas do curso de Engenharia de Software na Universidade Estácio de Sá.

---

## ✨ Funcionalidades

* **📡 Dashboard em Tempo Real:** Monitoramento de Temperatura, Tensão, Corrente e Potência.
* **🔌 Controle de Relés:** Controle remoto de até dois relés, com suporte a comandos manuais de Ligar/Desligar e envio de pulso elétrico.
* **🔔 Sistema de Alarmes:** Configuração de limites mínimos e máximos para Temperatura e Tensão, com alertas visuais no painel e notificações em tela (*toast*).
* **📊 Histórico (Sparklines):** Visualização gráfica simplificada das últimas 60 amostras de leitura de temperatura e tensão.
* **⚙️ Configuração Dinâmica:** Interface para configurar o servidor MQTT, porta, credenciais, tópico base e ID do dispositivo diretamente no app.

## 🛠️ Tecnologias Utilizadas

* **Framework:** [React Native](https://reactnative.dev/) com [Expo](https://expo.dev/)
* **Armazenamento Local:** `@react-native-async-storage/async-storage` (para salvar as configurações MQTT e preferências de alarme)
* **Comunicação IoT:** `mqtt` (MQTT.js operando via WebSockets)

## 📋 Pré-requisitos

1. **Node.js** instalado na sua máquina.
2. Aplicativo **Expo Go** instalado no seu smartphone (ou um emulador configurado).
3. Um **Broker MQTT** com suporte a **WebSockets** habilitado (geralmente utilizando a porta `9001`).
   * *Nota para Mosquitto MQTT:* É necessário adicionar `listener 9001` e `protocol websockets` no seu arquivo `mosquitto.conf`.

## 🚀 Como Executar o Projeto

1. Clone o repositório ou crie um novo projeto Expo base:
   ```bash
   npx create-expo-app FreezAlert
   cd FreezAlert
Instale as dependências necessárias:

Bash
npx expo install expo-notifications
npm install mqtt @react-native-async-storage/async-storage
Substitua o conteúdo do arquivo App.js pelo código fonte do projeto (FreezAlertApp.jsx).

Inicie o servidor de desenvolvimento do Expo:

Bash
npx expo start
Escaneie o QR Code gerado no terminal com o aplicativo Expo Go no seu celular.

📡 Estrutura de Tópicos e Comunicação MQTT
O aplicativo se comunica de forma bidirecional com o firmware do ESP32 utilizando a seguinte estrutura de tópicos:

📥 Escuta de Sensores (Subscribe)
Tópico: {base_topic}/{device_id}/sensores

Payload Esperado (JSON):

JSON
{
  "temp": 25.4,
  "voltage": 220.0,
  "current": 1.5,
  "power": 330,
  "rele1": "OFF",
  "rele2": "ON"
}
📤 Comandos de Controle (Publish)
Tópicos:

{base_topic}/{device_id}/comandos/rele1

{base_topic}/{device_id}/comandos/rele2

Payload Enviado: "ON" ou "OFF"

👨‍💻 Autor
Adivar Antonio da Silva Junior
