/**
 * FreezAlert — App React Native
 * Monitor IoT para ESP8266 via MQTT
 *
 * Tópicos mapeados do firmware:
 *   Sensores : {base_topic}/{device_id}/sensores  → { temp, voltage, current, power, rele1, rele2 }
 *   Comandos : {base_topic}/{device_id}/comandos/rele1  → "ON" | "OFF"
 *              {base_topic}/{device_id}/comandos/rele2  → "ON" | "OFF"
 *
 * Stack: React Native (Expo) + mqtt (react-native-mqtt ou mqtt.js via WebSocket)
 *
 * Para rodar:
 *   npx create-expo-app FreezAlert
 *   cd FreezAlert
 *   npx expo install expo-notifications
 *   npm install mqtt async-storage @react-native-async-storage/async-storage
 *   Substitua App.js pelo conteúdo deste arquivo
 *
 * NOTA: O broker MQTT precisa ter WebSocket habilitado (porta 9001 por padrão).
 *       No Mosquitto: listener 9001 / protocol websockets
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Switch, TextInput, Modal, Alert, Animated, Dimensions,
  StatusBar, RefreshControl, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as mqtt from 'mqtt'; // npm install mqtt

// ─────────────────────────────────────────────
//  PALETA  (industrial-tech com acentos âmbar)
// ─────────────────────────────────────────────
const C = {
  bg:        '#0D1117',
  surface:   '#161B22',
  card:      '#1C2330',
  border:    '#30363D',
  accent:    '#F0A500',   // âmbar — alerta
  accentDim: '#3D2B00',
  blue:      '#58A6FF',
  blueDim:   '#0D2137',
  green:     '#3FB950',
  greenDim:  '#0D2918',
  red:       '#F85149',
  redDim:    '#2D0F0E',
  text:      '#E6EDF3',
  muted:     '#8B949E',
  white:     '#FFFFFF',
};

const { width: SW } = Dimensions.get('window');

// ─────────────────────────────────────────────
//  DEFAULTS (espelham config.h e secrets.h)
// ─────────────────────────────────────────────
const DEFAULT_CONFIG = {
  mqttHost:   '172.236.118.172',
  mqttPort:   9001,              // WebSocket port
  mqttUser:   'jnr',
  mqttPass:   'hwbscom',
  baseTopic:  'empresa',
  deviceId:   'monitor_8266',
  tempMin:    0.0,
  tempMax:    60.0,
  voltMin:    190.0,
  voltMax:    250.0,
};

// ─────────────────────────────────────────────
//  STORAGE HELPERS
// ─────────────────────────────────────────────
const STORAGE_KEY = '@freezalert_config';

async function loadConfig() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch { return { ...DEFAULT_CONFIG }; }
}

async function saveConfig(cfg) {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
function fmt1(v)  { return typeof v === 'number' ? v.toFixed(1) : '--'; }
function fmt2(v)  { return typeof v === 'number' ? v.toFixed(2) : '--'; }
function fmt0(v)  { return typeof v === 'number' ? v.toFixed(0) : '--'; }

function statusColor(connected) { return connected ? C.green : C.red; }

// ─────────────────────────────────────────────
//  COMPONENTES BASE
// ─────────────────────────────────────────────
function Badge({ label, ok }) {
  return (
    <View style={[styles.badge, { backgroundColor: ok ? C.greenDim : C.redDim }]}>
      <View style={[styles.badgeDot, { backgroundColor: ok ? C.green : C.red }]} />
      <Text style={[styles.badgeText, { color: ok ? C.green : C.red }]}>{label}</Text>
    </View>
  );
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ─────────────────────────────────────────────
//  METRIC TILE  (temp / voltage / current / power)
// ─────────────────────────────────────────────
function MetricTile({ icon, label, value, unit, alarm }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (alarm) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.06, duration: 400, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [alarm]);

  return (
    <Animated.View style={[
      styles.metricTile,
      alarm && styles.metricTileAlarm,
      { transform: [{ scale: pulse }] }
    ]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, alarm && { color: C.red }]}>{value}</Text>
      <Text style={styles.metricUnit}>{unit}</Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
//  RELAY BUTTON
// ─────────────────────────────────────────────
function RelayCard({ id, label, state, onToggle, onPulse }) {
  const isOn = state === 'ON';
  return (
    <Card style={styles.relayCard}>
      <View style={styles.relayHeader}>
        <Text style={styles.relayLabel}>{label}</Text>
        <View style={[styles.relayIndicator, { backgroundColor: isOn ? C.green : C.border }]} />
      </View>
      <Text style={[styles.relayState, { color: isOn ? C.green : C.muted }]}>
        {isOn ? 'LIGADO' : 'DESLIGADO'}
      </Text>
      <View style={styles.relayBtns}>
        <TouchableOpacity
          style={[styles.relayBtn, { backgroundColor: isOn ? C.redDim : C.greenDim }]}
          onPress={() => onToggle(id, isOn ? 'OFF' : 'ON')}
        >
          <Text style={[styles.relayBtnText, { color: isOn ? C.red : C.green }]}>
            {isOn ? '⬛ Desligar' : '▶ Ligar'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.relayBtn, { backgroundColor: C.blueDim }]}
          onPress={() => onPulse(id)}
        >
          <Text style={[styles.relayBtnText, { color: C.blue }]}>⚡ Pulso</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  ALARM ROW
// ─────────────────────────────────────────────
function AlarmRow({ label, icon, min, max, active, onMin, onMax, onToggle }) {
  return (
    <Card style={styles.alarmCard}>
      <View style={styles.alarmHeader}>
        <Text style={styles.alarmIcon}>{icon}</Text>
        <Text style={styles.alarmLabel}>{label}</Text>
        <Switch
          value={active}
          onValueChange={onToggle}
          trackColor={{ false: C.border, true: C.accentDim }}
          thumbColor={active ? C.accent : C.muted}
        />
      </View>
      <View style={styles.alarmInputs}>
        <View style={styles.alarmInputGroup}>
          <Text style={styles.alarmInputLabel}>Mínimo</Text>
          <TextInput
            style={styles.alarmInput}
            value={String(min)}
            onChangeText={onMin}
            keyboardType="numeric"
            placeholderTextColor={C.muted}
          />
        </View>
        <View style={styles.alarmInputSep}>
          <Text style={styles.alarmSepText}>—</Text>
        </View>
        <View style={styles.alarmInputGroup}>
          <Text style={styles.alarmInputLabel}>Máximo</Text>
          <TextInput
            style={styles.alarmInput}
            value={String(max)}
            onChangeText={onMax}
            keyboardType="numeric"
            placeholderTextColor={C.muted}
          />
        </View>
      </View>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  SETTINGS MODAL
// ─────────────────────────────────────────────
function SettingsModal({ visible, config, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...config });

  useEffect(() => { setDraft({ ...config }); }, [config, visible]);

  function field(key) {
    return {
      value: String(draft[key]),
      onChangeText: (v) => setDraft(d => ({ ...d, [key]: v })),
      style: styles.settingsInput,
      placeholderTextColor: C.muted,
    };
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>⚙️ Configurações MQTT</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.settingsLabel}>Servidor (IP ou hostname)</Text>
            <TextInput {...field('mqttHost')} placeholder="Ex: 192.168.1.100" autoCapitalize="none" />

            <Text style={styles.settingsLabel}>Porta WebSocket</Text>
            <TextInput {...field('mqttPort')} placeholder="9001" keyboardType="numeric" />

            <Text style={styles.settingsLabel}>Usuário</Text>
            <TextInput {...field('mqttUser')} placeholder="user" autoCapitalize="none" />

            <Text style={styles.settingsLabel}>Senha</Text>
            <TextInput {...field('mqttPass')} placeholder="••••••" secureTextEntry />

            <Text style={styles.settingsLabel}>Tópico base</Text>
            <TextInput {...field('baseTopic')} placeholder="empresa" autoCapitalize="none" />

            <Text style={styles.settingsLabel}>Device ID</Text>
            <TextInput {...field('deviceId')} placeholder="monitor_8266" autoCapitalize="none" />

            <View style={styles.settingsBtns}>
              <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => onSave(draft)}>
                <Text style={styles.btnPrimaryText}>💾 Salvar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
//  HISTORY CHART (sparkline simples)
// ─────────────────────────────────────────────
function Sparkline({ data, color, width: W = SW - 64, height: H = 48 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  // SVG inline via uri não está disponível facilmente no RN sem lib,
  // então usamos barras de altura proporcional como fallback visual.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 2 }}>
      {data.slice(-20).map((v, i) => {
        const h = Math.max(4, ((v - min) / range) * H);
        return (
          <View
            key={i}
            style={{
              flex: 1, height: h,
              backgroundColor: color,
              borderRadius: 2,
              opacity: 0.5 + (i / 20) * 0.5,
            }}
          />
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────
//  ALERT TOAST
// ─────────────────────────────────────────────
function Toast({ message, visible }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(3000),
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, message]);

  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.toastText}>🚨 {message}</Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
//  APP PRINCIPAL
// ─────────────────────────────────────────────
export default function App() {
  const [config, setConfig]         = useState({ ...DEFAULT_CONFIG });
  const [connected, setConnected]   = useState(false);
  const [sensors, setSensors]       = useState({ temp: null, voltage: null, current: null, power: null });
  const [relays, setRelays]         = useState({ rele1: 'OFF', rele2: 'OFF' });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tempHistory, setTempHistory] = useState([]);
  const [voltHistory, setVoltHistory] = useState([]);
  const [alarms, setAlarms]         = useState({
    tempMin: DEFAULT_CONFIG.tempMin, tempMax: DEFAULT_CONFIG.tempMax, tempActive: true,
    voltMin: DEFAULT_CONFIG.voltMin, voltMax: DEFAULT_CONFIG.voltMax, voltActive: true,
  });
  const [toast, setToast]           = useState({ msg: '', key: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab]               = useState('dashboard'); // dashboard | relays | alarms | history
  const [refreshing, setRefreshing] = useState(false);

  const clientRef = useRef(null);
  const configRef = useRef(config);
  configRef.current = config;

  // ── ALARM CHECK ──────────────────────────────
  const checkAlarms = useCallback((s) => {
    setAlarms(a => {
      if (a.tempActive && s.temp !== null) {
        if (s.temp > a.tempMax || s.temp < a.tempMin) {
          setToast(t => ({ msg: `Temperatura crítica: ${fmt1(s.temp)}°C`, key: t.key + 1 }));
        }
      }
      if (a.voltActive && s.voltage !== null && s.voltage > 0) {
        if (s.voltage > a.voltMax || s.voltage < a.voltMin) {
          setToast(t => ({ msg: `Tensão crítica: ${fmt1(s.voltage)}V`, key: t.key + 1 }));
        }
      }
      return a;
    });
  }, []);

  // ── MQTT CONNECT ─────────────────────────────
  const connectMqtt = useCallback((cfg) => {
    if (clientRef.current) {
      try { clientRef.current.end(true); } catch {}
    }

    const { mqttHost, mqttPort, mqttUser, mqttPass, baseTopic, deviceId } = cfg;
    const url = `ws://${mqttHost}:${mqttPort}/mqtt`;
    const topicSensores = `${baseTopic}/${deviceId}/sensores`;

    const client = mqtt.connect(url, {
      username: mqttUser,
      password: mqttPass,
      clientId: `freezalert_${Math.random().toString(16).slice(2)}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
    });

    client.on('connect', () => {
      setConnected(true);
      client.subscribe(topicSensores, { qos: 0 });
    });

    client.on('offline', () => setConnected(false));
    client.on('error',   () => setConnected(false));

    client.on('message', (topic, payload) => {
      try {
        const d = JSON.parse(payload.toString());
        const s = {
          temp:    typeof d.temp    === 'number' ? d.temp    : null,
          voltage: typeof d.voltage === 'number' ? d.voltage : null,
          current: typeof d.current === 'number' ? d.current : null,
          power:   typeof d.power   === 'number' ? d.power   : null,
        };
        setSensors(s);
        setRelays({
          rele1: d.rele1 === 'ON' ? 'ON' : 'OFF',
          rele2: d.rele2 === 'ON' ? 'ON' : 'OFF',
        });
        setLastUpdate(new Date());
        if (s.temp !== null) setTempHistory(h => [...h.slice(-59), s.temp]);
        if (s.voltage !== null && s.voltage > 0)
          setVoltHistory(h => [...h.slice(-59), s.voltage]);
        checkAlarms(s);
      } catch {}
    });

    clientRef.current = client;
  }, [checkAlarms]);

  // ── PUBLISH RELAY COMMAND ─────────────────────
  const publishRelay = useCallback((relayId, cmd) => {
    const cfg = configRef.current;
    const topic = `${cfg.baseTopic}/${cfg.deviceId}/comandos/${relayId}`;
    if (clientRef.current?.connected) {
      clientRef.current.publish(topic, cmd, { qos: 1 });
      setRelays(r => ({ ...r, [relayId]: cmd }));
    } else {
      Alert.alert('Sem conexão', 'Aguarde a reconexão com o broker MQTT.');
    }
  }, []);

  const pulseRelay = useCallback((relayId) => {
    publishRelay(relayId, 'ON');
    setTimeout(() => publishRelay(relayId, 'OFF'), 300);
  }, [publishRelay]);

  // ── INIT ──────────────────────────────────────
  useEffect(() => {
    loadConfig().then(cfg => {
      setConfig(cfg);
      setAlarms(a => ({
        ...a,
        tempMin: cfg.tempMin ?? DEFAULT_CONFIG.tempMin,
        tempMax: cfg.tempMax ?? DEFAULT_CONFIG.tempMax,
        voltMin: cfg.voltMin ?? DEFAULT_CONFIG.voltMin,
        voltMax: cfg.voltMax ?? DEFAULT_CONFIG.voltMax,
      }));
      connectMqtt(cfg);
    });
    return () => { try { clientRef.current?.end(true); } catch {} };
  }, []);

  // ── SAVE CONFIG ───────────────────────────────
  const handleSaveConfig = useCallback(async (draft) => {
    const cfg = {
      ...draft,
      mqttPort: parseInt(draft.mqttPort) || 9001,
    };
    setConfig(cfg);
    await saveConfig(cfg);
    setShowSettings(false);
    connectMqtt(cfg);
  }, [connectMqtt]);

  // ── SAVE ALARMS ───────────────────────────────
  const saveAlarms = useCallback(async (next) => {
    setAlarms(next);
    const cfg = { ...configRef.current,
      tempMin: next.tempMin, tempMax: next.tempMax,
      voltMin: next.voltMin, voltMax: next.voltMax,
    };
    setConfig(cfg);
    await saveConfig(cfg);
  }, []);

  // ── REFRESH ───────────────────────────────────
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    connectMqtt(configRef.current);
    setTimeout(() => setRefreshing(false), 1500);
  }, [connectMqtt]);

  // ── ALARM CHECKS ─────────────────────────────
  const tempAlarm = alarms.tempActive && sensors.temp !== null &&
    (sensors.temp > alarms.tempMax || sensors.temp < alarms.tempMin);
  const voltAlarm = alarms.voltActive && sensors.voltage !== null && sensors.voltage > 0 &&
    (sensors.voltage > alarms.voltMax || sensors.voltage < alarms.voltMin);

  // ─────────────────────────────────────────────
  //  RENDER — DASHBOARD TAB
  // ─────────────────────────────────────────────
  function renderDashboard() {
    return (
      <>
        {/* Status bar */}
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Badge label="MQTT" ok={connected} />
            <Text style={styles.lastUpdate}>
              {lastUpdate
                ? `Atualizado ${lastUpdate.toLocaleTimeString('pt-BR')}`
                : 'Aguardando dados…'}
            </Text>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Text style={styles.gearBtn}>⚙️</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.deviceId}>
            {config.baseTopic}/{config.deviceId}
          </Text>
        </Card>

        {/* Metrics grid */}
        <View style={styles.metricsGrid}>
          <MetricTile
            icon="🌡️" label="Temperatura"
            value={fmt1(sensors.temp)} unit="°C"
            alarm={tempAlarm}
          />
          <MetricTile
            icon="⚡" label="Tensão"
            value={fmt1(sensors.voltage)} unit="V"
            alarm={voltAlarm}
          />
          <MetricTile
            icon="〰️" label="Corrente"
            value={fmt2(sensors.current)} unit="A"
            alarm={false}
          />
          <MetricTile
            icon="💡" label="Potência"
            value={fmt0(sensors.power)} unit="W"
            alarm={false}
          />
        </View>

        {/* Relay status summary */}
        <Card>
          <SectionTitle>Status dos Relés</SectionTitle>
          <View style={styles.relayStatusRow}>
            {['rele1', 'rele2'].map(id => (
              <View key={id} style={styles.relayStatusItem}>
                <View style={[
                  styles.relayStatusDot,
                  { backgroundColor: relays[id] === 'ON' ? C.green : C.border }
                ]} />
                <Text style={styles.relayStatusLabel}>
                  {id === 'rele1' ? 'Relé 1' : 'Relé 2'}
                </Text>
                <Text style={[
                  styles.relayStatusState,
                  { color: relays[id] === 'ON' ? C.green : C.muted }
                ]}>
                  {relays[id]}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Alarm status */}
        {(tempAlarm || voltAlarm) && (
          <Card style={styles.alarmBanner}>
            <Text style={styles.alarmBannerText}>
              ⚠️ {tempAlarm ? `Temperatura fora do limite (${fmt1(sensors.temp)}°C)` : ''}
              {tempAlarm && voltAlarm ? '\n' : ''}
              {voltAlarm ? `Tensão fora do limite (${fmt1(sensors.voltage)}V)` : ''}
            </Text>
          </Card>
        )}
      </>
    );
  }

  // ─────────────────────────────────────────────
  //  RENDER — RELAYS TAB
  // ─────────────────────────────────────────────
  function renderRelays() {
    return (
      <>
        <Card style={{ marginBottom: 8 }}>
          <Text style={styles.tabNote}>
            Comandos publicados em:{'\n'}
            <Text style={{ color: C.accent }}>
              {config.baseTopic}/{config.deviceId}/comandos/rele1 (ou rele2)
            </Text>
          </Text>
        </Card>
        <RelayCard
          id="rele1" label="Relé 1 — Alarme Temperatura"
          state={relays.rele1}
          onToggle={publishRelay}
          onPulse={pulseRelay}
        />
        <RelayCard
          id="rele2" label="Relé 2 — Alarme Tensão"
          state={relays.rele2}
          onToggle={publishRelay}
          onPulse={pulseRelay}
        />
      </>
    );
  }

  // ─────────────────────────────────────────────
  //  RENDER — ALARMS TAB
  // ─────────────────────────────────────────────
  function renderAlarms() {
    return (
      <>
        <Card style={{ marginBottom: 8 }}>
          <Text style={styles.tabNote}>
            Alarmes espelham a lógica de{' '}
            <Text style={{ color: C.accent }}>alarmes.cpp</Text>.
            Relé 1 → temperatura · Relé 2 → tensão.
          </Text>
        </Card>
        <AlarmRow
          label="Temperatura" icon="🌡️"
          min={alarms.tempMin} max={alarms.tempMax}
          active={alarms.tempActive}
          onMin={v => saveAlarms({ ...alarms, tempMin: parseFloat(v) || 0 })}
          onMax={v => saveAlarms({ ...alarms, tempMax: parseFloat(v) || 60 })}
          onToggle={v => saveAlarms({ ...alarms, tempActive: v })}
        />
        <AlarmRow
          label="Tensão" icon="⚡"
          min={alarms.voltMin} max={alarms.voltMax}
          active={alarms.voltActive}
          onMin={v => saveAlarms({ ...alarms, voltMin: parseFloat(v) || 190 })}
          onMax={v => saveAlarms({ ...alarms, voltMax: parseFloat(v) || 250 })}
          onToggle={v => saveAlarms({ ...alarms, voltActive: v })}
        />
        <Card>
          <Text style={styles.alarmNote}>
            💡 Padrões do firmware:{'\n'}
            Temperatura: {DEFAULT_CONFIG.tempMin}°C – {DEFAULT_CONFIG.tempMax}°C{'\n'}
            Tensão: {DEFAULT_CONFIG.voltMin}V – {DEFAULT_CONFIG.voltMax}V
          </Text>
        </Card>
      </>
    );
  }

  // ─────────────────────────────────────────────
  //  RENDER — HISTORY TAB
  // ─────────────────────────────────────────────
  function renderHistory() {
    return (
      <>
        <Card>
          <SectionTitle>Temperatura (últimas leituras)</SectionTitle>
          <Sparkline data={tempHistory} color={C.red} />
          {tempHistory.length > 0 && (
            <View style={styles.historyStats}>
              <Text style={styles.historyStatItem}>
                Mín: <Text style={{ color: C.blue }}>{fmt1(Math.min(...tempHistory))}°C</Text>
              </Text>
              <Text style={styles.historyStatItem}>
                Máx: <Text style={{ color: C.red }}>{fmt1(Math.max(...tempHistory))}°C</Text>
              </Text>
              <Text style={styles.historyStatItem}>
                Atual: <Text style={{ color: C.text }}>{fmt1(sensors.temp)}°C</Text>
              </Text>
            </View>
          )}
          {tempHistory.length === 0 && (
            <Text style={styles.noData}>Aguardando dados…</Text>
          )}
        </Card>

        <Card>
          <SectionTitle>Tensão (últimas leituras)</SectionTitle>
          <Sparkline data={voltHistory} color={C.accent} />
          {voltHistory.length > 0 && (
            <View style={styles.historyStats}>
              <Text style={styles.historyStatItem}>
                Mín: <Text style={{ color: C.blue }}>{fmt1(Math.min(...voltHistory))}V</Text>
              </Text>
              <Text style={styles.historyStatItem}>
                Máx: <Text style={{ color: C.accent }}>{fmt1(Math.max(...voltHistory))}V</Text>
              </Text>
              <Text style={styles.historyStatItem}>
                Atual: <Text style={{ color: C.text }}>{fmt1(sensors.voltage)}V</Text>
              </Text>
            </View>
          )}
          {voltHistory.length === 0 && (
            <Text style={styles.noData}>Aguardando dados…</Text>
          )}
        </Card>

        <Card>
          <Text style={styles.alarmNote}>
            📊 Intervalo de publicação MQTT: {5}s (MQTT_PUBLISH_INTERVAL){'\n'}
            Intervalo de leitura do sensor: {2}s (SENSOR_READ_INTERVAL){'\n'}
            Retenção no app: últimas 60 amostras
          </Text>
        </Card>
      </>
    );
  }

  // ─────────────────────────────────────────────
  //  ROOT RENDER
  // ─────────────────────────────────────────────
  const tabs = [
    { id: 'dashboard', icon: '📡', label: 'Monitor' },
    { id: 'relays',    icon: '🔌', label: 'Relés' },
    { id: 'alarms',    icon: '🔔', label: 'Alarmes' },
    { id: 'history',   icon: '📊', label: 'Histórico' },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>FreezAlert</Text>
          <Text style={styles.headerSub}>Monitor IoT · ESP8266</Text>
        </View>
        <Badge label={connected ? 'Online' : 'Offline'} ok={connected} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      >
        {tab === 'dashboard' && renderDashboard()}
        {tab === 'relays'    && renderRelays()}
        {tab === 'alarms'    && renderAlarms()}
        {tab === 'history'   && renderHistory()}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.navItem, tab === t.id && styles.navItemActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={styles.navIcon}>{t.icon}</Text>
            <Text style={[styles.navLabel, tab === t.id && styles.navLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Toast */}
      <Toast message={toast.msg} visible={!!toast.msg} key={toast.key} />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        config={config}
        onSave={handleSaveConfig}
        onClose={() => setShowSettings(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40,
                    paddingBottom: 12, backgroundColor: C.surface,
                    borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:    { fontSize: 22, fontWeight: '800', color: C.accent, letterSpacing: 1 },
  headerSub:      { fontSize: 12, color: C.muted, marginTop: 2 },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16, gap: 12 },

  // Cards
  card:           { backgroundColor: C.card, borderRadius: 14, padding: 16,
                    borderWidth: 1, borderColor: C.border },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: C.muted,
                    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },

  // Status
  statusCard:     { },
  statusRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastUpdate:     { fontSize: 11, color: C.muted, flex: 1, textAlign: 'center' },
  gearBtn:        { fontSize: 22 },
  deviceId:       { fontSize: 11, color: C.accent, marginTop: 8, fontFamily: 'monospace' },

  // Badge
  badge:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
                    paddingVertical: 5, borderRadius: 20, gap: 6 },
  badgeDot:       { width: 7, height: 7, borderRadius: 4 },
  badgeText:      { fontSize: 12, fontWeight: '700' },

  // Metrics
  metricsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricTile:     { width: (SW - 42) / 2, backgroundColor: C.card, borderRadius: 14,
                    padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  metricTileAlarm:{ borderColor: C.red, backgroundColor: C.redDim },
  metricIcon:     { fontSize: 24, marginBottom: 4 },
  metricLabel:    { fontSize: 11, color: C.muted, fontWeight: '600', letterSpacing: 0.5 },
  metricValue:    { fontSize: 32, fontWeight: '800', color: C.text, marginTop: 4 },
  metricUnit:     { fontSize: 13, color: C.muted, marginTop: 2 },

  // Relay status summary
  relayStatusRow: { flexDirection: 'row', gap: 12 },
  relayStatusItem:{ flex: 1, backgroundColor: C.surface, borderRadius: 10,
                    padding: 12, alignItems: 'center', gap: 6 },
  relayStatusDot: { width: 10, height: 10, borderRadius: 5 },
  relayStatusLabel:{ fontSize: 12, color: C.muted, fontWeight: '600' },
  relayStatusState:{ fontSize: 14, fontWeight: '800' },

  // Relay controls
  relayCard:      { },
  relayHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6 },
  relayLabel:     { fontSize: 14, color: C.text, fontWeight: '700' },
  relayIndicator: { width: 12, height: 12, borderRadius: 6 },
  relayState:     { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  relayBtns:      { flexDirection: 'row', gap: 10 },
  relayBtn:       { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  relayBtnText:   { fontSize: 13, fontWeight: '700' },

  // Alarms
  alarmBanner:    { backgroundColor: C.redDim, borderColor: C.red },
  alarmBannerText:{ color: C.red, fontWeight: '700', fontSize: 14, lineHeight: 22 },
  alarmCard:      { marginBottom: 0 },
  alarmHeader:    { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  alarmIcon:      { fontSize: 20 },
  alarmLabel:     { fontSize: 15, color: C.text, fontWeight: '700', flex: 1 },
  alarmInputs:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alarmInputGroup:{ flex: 1 },
  alarmInputLabel:{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: '600' },
  alarmInput:     { backgroundColor: C.surface, borderRadius: 10, padding: 12,
                    color: C.text, fontSize: 16, fontWeight: '700',
                    borderWidth: 1, borderColor: C.border, textAlign: 'center' },
  alarmInputSep:  { paddingTop: 20 },
  alarmSepText:   { color: C.muted, fontSize: 18 },
  alarmNote:      { color: C.muted, fontSize: 12, lineHeight: 20 },

  // History
  historyStats:   { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  historyStatItem:{ fontSize: 13, color: C.muted, fontWeight: '600' },
  noData:         { color: C.muted, textAlign: 'center', padding: 24, fontSize: 14 },

  // Bottom nav
  bottomNav:      { flexDirection: 'row', backgroundColor: C.surface,
                    borderTopWidth: 1, borderTopColor: C.border,
                    paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8 },
  navItem:        { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 8 },
  navItemActive:  { },
  navIcon:        { fontSize: 20 },
  navLabel:       { fontSize: 10, color: C.muted, marginTop: 3, fontWeight: '600' },
  navLabelActive: { color: C.accent },

  // Toast
  toast:          { position: 'absolute', top: Platform.OS === 'ios' ? 100 : 70,
                    left: 20, right: 20, backgroundColor: C.redDim,
                    borderWidth: 1, borderColor: C.red,
                    borderRadius: 12, padding: 16, zIndex: 999 },
  toastText:      { color: C.red, fontWeight: '700', fontSize: 14 },

  // Settings modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent:   { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
                    maxHeight: '85%' },
  modalTitle:     { fontSize: 18, color: C.text, fontWeight: '800', marginBottom: 20 },
  settingsLabel:  { fontSize: 12, color: C.muted, fontWeight: '700', marginTop: 14, marginBottom: 6,
                    letterSpacing: 0.5, textTransform: 'uppercase' },
  settingsInput:  { backgroundColor: C.card, borderRadius: 10, padding: 13,
                    color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
  settingsBtns:   { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnPrimary:     { flex: 1, backgroundColor: C.accent, borderRadius: 12,
                    paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { color: C.bg, fontWeight: '800', fontSize: 15 },
  btnSecondary:   { flex: 1, backgroundColor: C.card, borderRadius: 12,
                    paddingVertical: 14, alignItems: 'center',
                    borderWidth: 1, borderColor: C.border },
  btnSecondaryText:{ color: C.muted, fontWeight: '700', fontSize: 15 },

  // Tab notes
  tabNote:        { fontSize: 12, color: C.muted, lineHeight: 18 },
});
