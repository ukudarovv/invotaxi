//
//  ClientPhoneLoginView.swift
//  Invo
//

import SwiftUI

struct ClientPhoneLoginView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var db: MockDBService
    @State private var phone: String = ""
    @State private var showingOTP = false
    @State private var foundClient: Client?
    @State private var errorMessage: String?
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                VStack(spacing: 10) {
                    Image(systemName: "phone.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.green)
                    
                    Text("Вход")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Введите номер телефона")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                
                VStack(alignment: .leading, spacing: 10) {
                    TextField("+7 (___) ___-__-__", text: $phone)
                        .keyboardType(.phonePad)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .font(.title3)
                        .onChange(of: phone) { newValue in
                            phone = formatPhone(newValue)
                        }
                    
                    if let error = errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
                .padding(.horizontal)
                
                Button(action: {
                    sendOTP()
                }) {
                    Text("Получить код")
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(phone.count >= 10 ? Color.green : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .disabled(phone.count < 10)
                .padding(.horizontal)
                
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $showingOTP) {
            if let client = foundClient {
                ClientOTPView(client: client, phone: phone)
                    .environmentObject(appState)
                    .environmentObject(db)
            }
        }
    }
    
    private func formatPhone(_ phone: String) -> String {
        let cleaned = phone.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
        if cleaned.isEmpty {
            return "+7 "
        }
        if cleaned.count <= 1 {
            return "+7 \(cleaned)"
        }
        if cleaned.count <= 4 {
            return "+7 (\(cleaned.dropFirst()))"
        }
        if cleaned.count <= 7 {
            let part1 = String(cleaned.dropFirst().prefix(3))
            let part2 = String(cleaned.dropFirst(4).prefix(3))
            return "+7 (\(part1)) \(part2)"
        }
        if cleaned.count <= 9 {
            let part1 = String(cleaned.dropFirst().prefix(3))
            let part2 = String(cleaned.dropFirst(4).prefix(3))
            let part3 = String(cleaned.dropFirst(7).prefix(2))
            return "+7 (\(part1)) \(part2)-\(part3)"
        }
        let part1 = String(cleaned.dropFirst().prefix(3))
        let part2 = String(cleaned.dropFirst(4).prefix(3))
        let part3 = String(cleaned.dropFirst(7).prefix(2))
        let part4 = String(cleaned.dropFirst(9).prefix(2))
        return "+7 (\(part1)) \(part2)-\(part3)-\(part4)"
    }
    
    private func sendOTP() {
        // Ищем клиента по телефону (сравниваем последние 10 цифр без кода страны)
        let cleanedPhone = phone.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
        guard cleanedPhone.count >= 10 else {
            errorMessage = "Введите корректный номер телефона"
            return
        }
        
        let phoneDigits = cleanedPhone.count >= 11 ? String(cleanedPhone.suffix(10)) : cleanedPhone
        
        foundClient = db.clients.first { client in
            let clientPhoneDigits = client.phone.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
            let clientLast10 = clientPhoneDigits.count >= 11 ? String(clientPhoneDigits.suffix(10)) : clientPhoneDigits
            return clientLast10 == phoneDigits
        }
        
        // Для демо: если номер не найден, но номер валидный (10+ цифр), используем первого клиента
        if foundClient == nil && cleanedPhone.count >= 10 {
            foundClient = db.clients.first
        }
        
        if foundClient != nil {
            errorMessage = nil
            showingOTP = true
        } else {
            errorMessage = "Клиент с таким номером не найден"
        }
    }
}

