import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import ReactLoading from 'react-loading'
import axios from 'axios'
import { toast } from 'react-toastify'
import { mockChats } from '../mocks/data'
import SockJS from 'sockjs-client'
import Stomp from 'stompjs'

function ChatRoom() {
    const { roomId } = useParams()
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [authorName, setAuthorName] = useState('')
    const [loading, setLoading] = useState(true)
    const [connected, setConnected] = useState(false)
    const [afterChatMessageId, setAfterChatMessageId] = useState(0)
    const messagesEndRef = useRef(null)
    const wsRef = useRef(null)

    // 초기 메시지 로드
    const fetchInitialMessages = async () => {
        try {
            const response = await axios.get(`http://localhost:8070/api/v1/chat/rooms/${roomId}/messages`, {
                params: { afterChatMessageId },
            })
            if (response.data && response.data.length > 0) {
                setMessages(response.data)
                setAfterChatMessageId(response.data[response.data.length - 1].id)
            }
        } catch (error) {
            console.error('Error fetching initial messages:', error)
            setMessages(mockChats)
            toast.warning('테스트 데이터를 표시합니다.')
            // toast.error('채팅 연결에 문제가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    // WebSocket 연결 설정
    const connectWebSocket = () => {
        try {
            console.log('WebSocket 연결 시도')
            // const ws = new WebSocket(`ws://localhost:8070/ws/chat/${roomId}`)

            if (wsRef.current && wsRef.current) {
                console.log('Websocket is already connected')
                return
            }

            const socket = new SockJS('http://localhost:8070/ws/chat')
            const stompClient = Stomp.over(socket)

            stompClient.connect({}, (frame) => {
                console.log('STOMP Connected:', frame)
                setConnected(true)

                // 메시지를 수신하기 위해 해당 채팅방을 구독
                stompClient.subscribe(`/topic/chat/${roomId}`, (message) => {
                    const receivedMessage = JSON.parse(message.body)
                    console.log('Received message:', receivedMessage)

                    setMessages((prevMessages) => {
                        // 이미 같은 내용의 메시지가 있는지 확인
                        const isDuplicate = prevMessages.some(
                            (msg) =>
                                msg.content === receivedMessage.content &&
                                msg.author === receivedMessage.author &&
                                // 최근 2초 이내의 메시지인지 확인
                                new Date(msg.createdAt).getTime() > Date.now() - 2000,
                        )

                        if (isDuplicate) {
                            return prevMessages
                        }

                        return [
                            ...prevMessages,
                            {
                                id: `msg${prevMessages.length + 1}`,
                                content: receivedMessage.content,
                                author: receivedMessage.author,
                                createdAt: new Date().toISOString(),
                                isMyMessage: receivedMessage.author === authorName,
                            },
                        ]
                    })
                })

                wsRef.current = stompClient
            })
        } catch (error) {
            console.error('WebSocket connection error:', error)
            toast.error('채팅 연결에 실패했습니다.')
        }
    }

    // 컴포넌트 마운트 시 초기화
    useEffect(() => {
        fetchInitialMessages()
        // 웹 소켓 연결
        connectWebSocket()
        // connectWebSocket()

        // 컴포넌트 언마운트 시 WebSocket 연결 종료
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [roomId])

    // 새 메시지 수신 시 스크롤
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!newMessage.trim() || !authorName.trim()) return

        const newChat = {
            id: `msg${messages.length + 1}`,
            content: newMessage,
            author: authorName,
            createdAt: new Date().toISOString(),
            isMyMessage: true,
        }

        try {
            if (connected && wsRef.current) {
                // WebSocket을 통해 메시지 전송만 하고, UI 업데이트는 구독을 통해 처리
                wsRef.current.send(
                    `/app/chat/${roomId}/sendMessage`,
                    {},
                    JSON.stringify({
                        content: newMessage,
                        author: authorName,
                    }),
                )
            } else {
                // WebSocket 연결이 없을 경우에만 HTTP API 사용 및 UI 직접 업데이트
                await axios.post(`http://localhost:8070/api/v1/chat/rooms/${roomId}/messages`, {
                    content: newMessage,
                    author: authorName,
                })
                setMessages((prev) => [...prev, newChat])
            }
        } catch (error) {
            console.error('Error sending message:', error)
            toast.warning('테스트 모드로 작동합니다.')
        }

        setNewMessage('')
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="text-center">
                    <ReactLoading type="spin" color="#4F46E5" height={50} width={50} className="mx-auto mb-4" />
                    <p className="text-gray-600">로딩중...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-3xl">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-indigo-600 text-white p-4">
                    <h1 className="text-xl font-bold">DATA BLOCKS 채팅방</h1>
                    <p className="text-sm opacity-75">Backend Developer들과의 대화</p>
                </div>

                <div className="h-[600px] overflow-y-auto p-4 bg-gray-50">
                    <div className="space-y-4">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex flex-col ${message.isMyMessage ? 'items-end' : 'items-start'}`}
                            >
                                <span className="text-sm font-medium text-gray-600 mb-1 px-2">
                                    {message.author || '익명'}
                                </span>
                                <div
                                    className={`max-w-[70%] ${
                                        message.isMyMessage
                                            ? 'bg-indigo-500 text-white rounded-l-lg rounded-tr-lg'
                                            : 'bg-white text-gray-800 rounded-r-lg rounded-tl-lg'
                                    } p-3 shadow-md`}
                                >
                                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                    <p className="text-xs text-right mt-1 opacity-75">
                                        {new Date(message.createdAt).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </p>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-4 bg-white border-t">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={authorName}
                            onChange={(e) => setAuthorName(e.target.value)}
                            placeholder="작성자 이름"
                            className="w-1/4 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="메시지를 입력하세요..."
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                        <button
                            type="submit"
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            전송
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default ChatRoom
