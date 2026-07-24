package br.com.insano.sambah;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    static final String PREFS_NAME = "sambah_android";
    static final String KEY_COOKIE = "cookie";
    static final String KEY_PHONE = "operator_phone";
    static final String KEY_USERNAME = "username";
    static final String KEY_SEEN_ALERTS = "seen_alerts";
    static final String EXTRA_ALERT_ID = "alertId";
    static final String EXTRA_CONVERSATION_ID = "conversationId";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<AlertItem> alerts = new ArrayList<>();
    private SharedPreferences prefs;

    private LinearLayout loginPanel;
    private LinearLayout workPanel;
    private EditText usernameInput;
    private EditText passwordInput;
    private EditText phoneInput;
    private Button loginButton;
    private TextView statusText;
    private ListView alertsList;
    private ArrayAdapter<String> alertsAdapter;
    private TextView conversationHeader;
    private TextView messagesText;
    private EditText replyInput;
    private Button replyButton;
    private Button resolveButton;

    private String selectedConversationId = "";
    private String selectedAlertId = "";
    private long selectedVersion = 0;

    private final Runnable foregroundRefresh = new Runnable() {
        @Override
        public void run() {
            if (workPanel != null && workPanel.getVisibility() == View.VISIBLE) loadAlerts();
            mainHandler.postDelayed(this, 10000);
        }
    };

    private final BroadcastReceiver alertReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            loadAlerts();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        buildScreen();
        requestNotificationPermission();

        if (!prefs.getString(KEY_COOKIE, "").isEmpty()) {
            showWork();
            startAlertService();
            loadAlerts();
            openFromIntent(getIntent());
        } else {
            showLogin();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openFromIntent(intent);
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(AlertPollingService.ACTION_ALERTS_UPDATED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(alertReceiver, filter, RECEIVER_NOT_EXPORTED);
        else registerReceiver(alertReceiver, filter);
        mainHandler.post(foregroundRefresh);
    }

    @Override
    protected void onStop() {
        mainHandler.removeCallbacks(foregroundRefresh);
        try {
            unregisterReceiver(alertReceiver);
        } catch (IllegalArgumentException ignored) {
        }
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void buildScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(16), dp(16), dp(12));
        root.setBackgroundColor(Color.rgb(245, 247, 250));

        TextView title = text("SamBah", 26, true);
        root.addView(title, matchWrap());
        statusText = text("Entre para receber chamadas.", 15, false);
        statusText.setTextColor(Color.DKGRAY);
        root.addView(statusText, matchWrap());

        loginPanel = new LinearLayout(this);
        loginPanel.setOrientation(LinearLayout.VERTICAL);
        loginPanel.setPadding(0, dp(24), 0, 0);

        usernameInput = input("Usuário do SamBah");
        usernameInput.setText(prefs.getString(KEY_USERNAME, ""));
        loginPanel.addView(usernameInput, matchWrap());

        passwordInput = input("Senha");
        passwordInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        loginPanel.addView(passwordInput, spaced());

        phoneInput = input("Telefone do atendente");
        phoneInput.setInputType(InputType.TYPE_CLASS_PHONE);
        phoneInput.setText(prefs.getString(KEY_PHONE, "5551980413745"));
        loginPanel.addView(phoneInput, spaced());

        loginButton = button("Entrar e ativar alertas");
        loginButton.setOnClickListener(view -> login());
        loginPanel.addView(loginButton, spaced());
        root.addView(loginPanel, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        workPanel = new LinearLayout(this);
        workPanel.setOrientation(LinearLayout.VERTICAL);
        workPanel.setPadding(0, dp(12), 0, 0);

        TextView pendingLabel = text("Chamadas pendentes", 17, true);
        workPanel.addView(pendingLabel, matchWrap());

        alertsAdapter = new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, new ArrayList<>());
        alertsList = new ListView(this);
        alertsList.setAdapter(alertsAdapter);
        alertsList.setOnItemClickListener((parent, view, position, id) -> {
            if (position < 0 || position >= alerts.size()) return;
            AlertItem item = alerts.get(position);
            selectedAlertId = item.alertId;
            openConversation(item.conversationId);
        });
        workPanel.addView(alertsList, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(180)));

        conversationHeader = text("Selecione uma chamada.", 17, true);
        conversationHeader.setPadding(0, dp(10), 0, dp(6));
        workPanel.addView(conversationHeader, matchWrap());

        messagesText = text("", 16, false);
        messagesText.setTextIsSelectable(true);
        messagesText.setPadding(dp(10), dp(10), dp(10), dp(10));
        messagesText.setBackgroundColor(Color.WHITE);
        ScrollView messageScroll = new ScrollView(this);
        messageScroll.addView(messagesText, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        workPanel.addView(messageScroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        replyInput = input("Escreva a resposta");
        replyInput.setMinLines(2);
        replyInput.setMaxLines(4);
        workPanel.addView(replyInput, spaced());

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        replyButton = button("Responder");
        resolveButton = button("Concluir");
        replyButton.setEnabled(false);
        resolveButton.setEnabled(false);
        replyButton.setOnClickListener(view -> sendReply());
        resolveButton.setOnClickListener(view -> resolveConversation());
        actions.addView(replyButton, new LinearLayout.LayoutParams(0, dp(52), 1f));
        LinearLayout.LayoutParams secondButton = new LinearLayout.LayoutParams(0, dp(52), 1f);
        secondButton.setMarginStart(dp(8));
        actions.addView(resolveButton, secondButton);
        workPanel.addView(actions, spaced());

        root.addView(workPanel, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void login() {
        String username = usernameInput.getText().toString().trim();
        String password = passwordInput.getText().toString();
        String phone = digits(phoneInput.getText().toString());
        if (username.isEmpty() || password.isEmpty() || phone.isEmpty()) {
            statusText.setText("Preencha usuário, senha e telefone.");
            return;
        }

        loginButton.setEnabled(false);
        statusText.setText("Entrando no SamBah...");
        executor.execute(() -> {
            try {
                ApiClient.Result result = ApiClient.login(username, password);
                if (!result.ok() || result.cookie.isEmpty()) throw new IllegalStateException(result.error());
                prefs.edit()
                        .putString(KEY_COOKIE, result.cookie)
                        .putString(KEY_PHONE, phone)
                        .putString(KEY_USERNAME, username)
                        .apply();
                mainHandler.post(() -> {
                    passwordInput.setText("");
                    loginButton.setEnabled(true);
                    showWork();
                    startAlertService();
                    loadAlerts();
                    openFromIntent(getIntent());
                });
            } catch (Exception error) {
                mainHandler.post(() -> {
                    loginButton.setEnabled(true);
                    statusText.setText("Não entrou: " + safeMessage(error));
                });
            }
        });
    }

    private void loadAlerts() {
        String phone = prefs.getString(KEY_PHONE, "");
        if (phone.isEmpty()) return;
        executor.execute(() -> {
            try {
                ApiClient.Result result = ApiClient.alerts(phone, prefs.getString(KEY_COOKIE, ""));
                if (result.status < 200 || result.status >= 300) throw new IllegalStateException(result.error());
                JSONArray jsonAlerts = result.json.optJSONArray("alerts");
                List<AlertItem> loaded = new ArrayList<>();
                List<String> labels = new ArrayList<>();
                if (jsonAlerts != null) {
                    for (int index = 0; index < jsonAlerts.length(); index++) {
                        JSONObject alert = jsonAlerts.optJSONObject(index);
                        if (alert == null) continue;
                        AlertItem item = new AlertItem(
                                alert.optString("id", ""),
                                alert.optString("conversationId", ""),
                                alert.optString("clientName", "Cliente WhatsApp"),
                                alert.optString("lastMessage", alert.optString("message", "Nova chamada"))
                        );
                        if (item.conversationId.isEmpty()) continue;
                        loaded.add(item);
                        labels.add(item.clientName + "\n" + item.message);
                    }
                }
                mainHandler.post(() -> {
                    alerts.clear();
                    alerts.addAll(loaded);
                    alertsAdapter.clear();
                    alertsAdapter.addAll(labels);
                    alertsAdapter.notifyDataSetChanged();
                    statusText.setText(loaded.isEmpty() ? "Nenhuma chamada pendente." : loaded.size() + " chamada(s) pendente(s).");
                });
            } catch (Exception error) {
                mainHandler.post(() -> statusText.setText("Falha ao buscar chamadas: " + safeMessage(error)));
            }
        });
    }

    private void openConversation(String conversationId) {
        if (conversationId == null || conversationId.isEmpty()) return;
        selectedConversationId = conversationId;
        conversationHeader.setText("Abrindo conversa...");
        messagesText.setText("");
        replyButton.setEnabled(false);
        resolveButton.setEnabled(false);
        executor.execute(() -> {
            try {
                ApiClient.Result result = ApiClient.conversation(conversationId, prefs.getString(KEY_COOKIE, ""));
                if (result.status == 401) throw new SessionExpiredException();
                if (!result.ok()) throw new IllegalStateException(result.error());
                JSONObject conversation = result.json.optJSONObject("conversa");
                if (conversation == null) throw new IllegalStateException("Conversa não encontrada");
                selectedVersion = conversation.optLong("version", 0);
                String name = conversation.optString("nome", "Cliente WhatsApp");
                String phone = conversation.optString("telefone", "");
                String history = formatMessages(conversation.optJSONArray("mensagens"));
                if (!selectedAlertId.isEmpty()) {
                    try {
                        ApiClient.markAlertRead(selectedAlertId, prefs.getString(KEY_COOKIE, ""));
                    } catch (Exception ignored) {
                    }
                }
                mainHandler.post(() -> {
                    conversationHeader.setText(name + (phone.isEmpty() ? "" : " · " + phone));
                    messagesText.setText(history.isEmpty() ? "Sem histórico." : history);
                    replyButton.setEnabled(true);
                    resolveButton.setEnabled(true);
                    loadAlerts();
                });
            } catch (SessionExpiredException error) {
                mainHandler.post(this::expireSession);
            } catch (Exception error) {
                mainHandler.post(() -> {
                    conversationHeader.setText("Falha ao abrir conversa");
                    messagesText.setText(safeMessage(error));
                });
            }
        });
    }

    private void sendReply() {
        String text = replyInput.getText().toString().trim();
        if (selectedConversationId.isEmpty() || text.isEmpty()) return;
        replyButton.setEnabled(false);
        statusText.setText("Enviando resposta...");
        String conversationId = selectedConversationId;
        executor.execute(() -> {
            try {
                ApiClient.Result result = ApiClient.reply(conversationId, text, prefs.getString(KEY_COOKIE, ""));
                if (result.status == 401) throw new SessionExpiredException();
                if (!result.ok()) throw new IllegalStateException(result.error());
                boolean delivered = result.json.optBoolean("enviado", false) || result.json.optBoolean("duplicate", false);
                String reason = result.json.optString("reason", "");
                mainHandler.post(() -> {
                    replyButton.setEnabled(true);
                    if (delivered) {
                        replyInput.setText("");
                        statusText.setText("Resposta enviada ao cliente.");
                    } else {
                        statusText.setText("Resposta não entregue: " + (reason.isEmpty() ? "sem confirmação" : reason));
                    }
                    openConversation(conversationId);
                });
            } catch (SessionExpiredException error) {
                mainHandler.post(this::expireSession);
            } catch (Exception error) {
                mainHandler.post(() -> {
                    replyButton.setEnabled(true);
                    statusText.setText("Falha no envio: " + safeMessage(error));
                });
            }
        });
    }

    private void resolveConversation() {
        if (selectedConversationId.isEmpty()) return;
        resolveButton.setEnabled(false);
        statusText.setText("Concluindo atendimento...");
        String conversationId = selectedConversationId;
        long version = selectedVersion;
        executor.execute(() -> {
            try {
                ApiClient.Result result = ApiClient.resolve(conversationId, version, prefs.getString(KEY_COOKIE, ""));
                if (result.status == 401) throw new SessionExpiredException();
                if (!result.ok()) throw new IllegalStateException(result.error());
                mainHandler.post(() -> {
                    statusText.setText("Atendimento concluído.");
                    selectedConversationId = "";
                    selectedAlertId = "";
                    selectedVersion = 0;
                    conversationHeader.setText("Selecione uma chamada.");
                    messagesText.setText("");
                    replyInput.setText("");
                    replyButton.setEnabled(false);
                    resolveButton.setEnabled(false);
                    loadAlerts();
                });
            } catch (SessionExpiredException error) {
                mainHandler.post(this::expireSession);
            } catch (Exception error) {
                mainHandler.post(() -> {
                    resolveButton.setEnabled(true);
                    statusText.setText("Falha ao concluir: " + safeMessage(error));
                });
            }
        });
    }

    private void openFromIntent(Intent intent) {
        if (intent == null || workPanel.getVisibility() != View.VISIBLE) return;
        String alertId = intent.getStringExtra(EXTRA_ALERT_ID);
        String conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID);
        if (alertId != null) selectedAlertId = alertId;
        if (conversationId != null && !conversationId.isEmpty()) {
            intent.removeExtra(EXTRA_ALERT_ID);
            intent.removeExtra(EXTRA_CONVERSATION_ID);
            openConversation(conversationId);
        }
    }

    private void expireSession() {
        prefs.edit().remove(KEY_COOKIE).apply();
        statusText.setText("Sessão encerrada. Entre novamente.");
        showLogin();
    }

    private void showLogin() {
        loginPanel.setVisibility(View.VISIBLE);
        workPanel.setVisibility(View.GONE);
    }

    private void showWork() {
        loginPanel.setVisibility(View.GONE);
        workPanel.setVisibility(View.VISIBLE);
        statusText.setText("Aguardando chamadas...");
    }

    private void startAlertService() {
        Intent service = new Intent(this, AlertPollingService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(service);
        else startService(service);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 10);
        }
    }

    private String formatMessages(JSONArray messages) {
        if (messages == null) return "";
        StringBuilder history = new StringBuilder();
        for (int index = 0; index < messages.length(); index++) {
            JSONObject message = messages.optJSONObject(index);
            if (message == null) continue;
            String direction = message.optString("direction", message.optString("direcao", ""));
            String text = firstNonEmpty(
                    message.optString("text", ""),
                    message.optString("body", ""),
                    message.optString("message", ""),
                    message.optString("conteudo", "")
            );
            if (text.isEmpty()) continue;
            String sender = "out".equalsIgnoreCase(direction) || "saida".equalsIgnoreCase(direction) ? "Você" : "Cliente";
            if (history.length() > 0) history.append("\n\n");
            history.append(sender).append(": ").append(text);
        }
        return history.toString();
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) if (value != null && !value.isEmpty()) return value;
        return "";
    }

    private EditText input(String hint) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setTextSize(17);
        input.setSingleLine(false);
        input.setPadding(dp(12), dp(10), dp(12), dp(10));
        input.setBackgroundColor(Color.WHITE);
        return input;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(16);
        button.setAllCaps(false);
        return button;
    }

    private TextView text(String value, int size, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(Color.rgb(17, 24, 39));
        if (bold) text.setTypeface(text.getTypeface(), android.graphics.Typeface.BOLD);
        return text;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams spaced() {
        LinearLayout.LayoutParams params = matchWrap();
        params.topMargin = dp(10);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        return message == null || message.isEmpty() ? "erro desconhecido" : message;
    }

    private static final class AlertItem {
        final String alertId;
        final String conversationId;
        final String clientName;
        final String message;

        AlertItem(String alertId, String conversationId, String clientName, String message) {
            this.alertId = alertId;
            this.conversationId = conversationId;
            this.clientName = clientName;
            this.message = message;
        }
    }

    private static final class SessionExpiredException extends Exception {
    }
}
