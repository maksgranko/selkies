from aiohttp import web
import pathlib
import argparse

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    async for msg in ws:
        if msg.type == web.WSMsgType.TEXT:
            await ws.send_str("Echo: " + msg.data)
        elif msg.type == web.WSMsgType.CLOSED:
            break
    return ws

async def turn_handler(request):
    # Return empty ICE servers for now, or configure as needed
    return web.json_response({"iceServers": []})

@web.middleware
async def cors_middleware(request, handler):
    if request.method == 'OPTIONS':
        response = web.Response()
    else:
        response = await handler(request)
    
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS, PUT, DELETE'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

app = web.Application(middlewares=[cors_middleware])
app.router.add_get("/ws", websocket_handler)
app.router.add_get("/turn", turn_handler)

# Serve static files
current_path = pathlib.Path(__file__).parent
static_path = current_path / "static"
print(static_path)
app.router.add_static("/", path=static_path, name="static")

if __name__ == '__main__':
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Run WebSocket server')
    parser.add_argument('--port', type=int, default=8080, 
                        help='Port to run the server on (default: 8080)')
    args = parser.parse_args()
    web.run_app(app, port=args.port)
