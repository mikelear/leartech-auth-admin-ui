{{- define "leartech-auth-admin-ui.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "leartech-auth-admin-ui.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "leartech-auth-admin-ui.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{ include "leartech-auth-admin-ui.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | default .Chart.Version | quote }}
{{- end }}

{{- define "leartech-auth-admin-ui.selectorLabels" -}}
app.kubernetes.io/name: {{ include "leartech-auth-admin-ui.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Library aliases — map leartech.* to chart-specific names */}}
{{- define "leartech.fullname" -}}
{{ include "leartech-auth-admin-ui.fullname" . }}
{{- end }}

{{- define "leartech.labels" -}}
{{ include "leartech-auth-admin-ui.labels" . }}
{{- end }}
