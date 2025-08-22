import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: number;
    email: string;
    role: UserRole;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure based on your frontend domain in production
    methods: ['GET', 'POST'],
  },
  namespace: '/orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();

  handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);

    // Leave all rooms when disconnecting
    if (client.user) {
      void client.leave(`user-${client.user.id}`);
      void client.leave(`role-${client.user.role.toLowerCase()}`);
    }
  }

  @SubscribeMessage('authenticate')
  handleAuthentication(
    @ConnectedSocket() client: AuthenticatedSocket,
    // @MessageBody() _payload: { token: string },
  ) {
    try {
      // Note: In a real implementation, you would verify the JWT token here
      // For now, we'll trust the client to send user info
      // In production, implement proper JWT verification in WebSocket context

      this.logger.log(`Authentication attempt for client: ${client.id}`);

      // For demo purposes, we'll extract user info from a simple payload
      // In production, decode and verify the JWT token
      return { status: 'authenticated', message: 'Successfully authenticated' };
    } catch (error) {
      this.logger.error(
        `Authentication failed for client ${client.id}:`,
        error,
      );
      return { status: 'error', message: 'Authentication failed' };
    }
  }

  @SubscribeMessage('join-user-room')
  handleJoinUserRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { userId: number; userRole: UserRole },
  ) {
    try {
      // Set user info on socket
      client.user = {
        id: payload.userId,
        email: '', // Would be set from JWT in production
        role: payload.userRole,
      };

      // Join user-specific room
      const userRoom = `user-${payload.userId}`;
      void client.join(userRoom);

      // Join role-specific room
      const roleRoom = `role-${payload.userRole.toLowerCase()}`;
      void client.join(roleRoom);

      this.connectedClients.set(client.id, client);

      this.logger.log(
        `User ${payload.userId} (${payload.userRole}) joined rooms: ${userRoom}, ${roleRoom}`,
      );

      return {
        status: 'success',
        message: `Joined rooms: ${userRoom}, ${roleRoom}`,
        rooms: [userRoom, roleRoom],
      };
    } catch (error) {
      this.logger.error(`Failed to join rooms for client ${client.id}:`, error);
      return { status: 'error', message: 'Failed to join rooms' };
    }
  }

  @SubscribeMessage('join-order-room')
  handleJoinOrderRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { orderId: number },
  ) {
    try {
      const orderRoom = `order-${payload.orderId}`;
      void client.join(orderRoom);

      this.logger.log(`Client ${client.id} joined order room: ${orderRoom}`);

      return {
        status: 'success',
        message: `Joined order room: ${orderRoom}`,
        room: orderRoom,
      };
    } catch (error) {
      this.logger.error(
        `Failed to join order room for client ${client.id}:`,
        error,
      );
      return { status: 'error', message: 'Failed to join order room' };
    }
  }

  @SubscribeMessage('leave-order-room')
  handleLeaveOrderRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { orderId: number },
  ) {
    try {
      const orderRoom = `order-${payload.orderId}`;
      void client.leave(orderRoom);

      this.logger.log(`Client ${client.id} left order room: ${orderRoom}`);

      return {
        status: 'success',
        message: `Left order room: ${orderRoom}`,
        room: orderRoom,
      };
    } catch (error) {
      this.logger.error(
        `Failed to leave order room for client ${client.id}:`,
        error,
      );
      return { status: 'error', message: 'Failed to leave order room' };
    }
  }

  // Server-side methods for broadcasting updates
  broadcastOrderStatusUpdate(orderData: {
    orderId: number;
    buyerId: number;
    supplierIds: number[];
    orderNumber: string;
    oldStatus: string;
    newStatus: string;
    updatedBy: {
      id: number;
      email: string;
      role: UserRole;
    };
    updatedAt: string;
    reason?: string;
  }) {
    const updatePayload = {
      type: 'order-status-updated',
      data: orderData,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to specific order room
    this.server
      .to(`order-${orderData.orderId}`)
      .emit('order-update', updatePayload);

    // Broadcast to buyer
    this.server
      .to(`user-${orderData.buyerId}`)
      .emit('order-update', updatePayload);

    // Broadcast to all suppliers involved in the order
    orderData.supplierIds.forEach((supplierId) => {
      this.server.to(`user-${supplierId}`).emit('order-update', updatePayload);
    });

    // Broadcast to all admins
    this.server.to('role-admin').emit('order-update', updatePayload);

    this.logger.log(
      `Broadcasted order status update for order ${orderData.orderNumber}: ${orderData.oldStatus} → ${orderData.newStatus}`,
    );
  }

  broadcastNewOrder(orderData: {
    orderId: number;
    buyerId: number;
    supplierIds: number[];
    orderNumber: string;
    totalAmount: number;
    itemCount: number;
    createdAt: string;
  }) {
    const updatePayload = {
      type: 'new-order-created',
      data: orderData,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to suppliers involved in the order
    orderData.supplierIds.forEach((supplierId) => {
      this.server.to(`user-${supplierId}`).emit('order-update', updatePayload);
    });

    // Broadcast to all admins
    this.server.to('role-admin').emit('order-update', updatePayload);

    this.logger.log(
      `Broadcasted new order creation: ${orderData.orderNumber} by buyer ${orderData.buyerId}`,
    );
  }

  broadcastStockUpdate(stockData: {
    productId: number;
    productName: string;
    supplierId: number;
    oldStock: number;
    newStock: number;
    operation: 'increment' | 'decrement';
    reason: string;
  }) {
    const updatePayload = {
      type: 'stock-updated',
      data: stockData,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to the supplier
    this.server
      .to(`user-${stockData.supplierId}`)
      .emit('stock-update', updatePayload);

    // Broadcast to all admins
    this.server.to('role-admin').emit('stock-update', updatePayload);

    this.logger.log(
      `Broadcasted stock update for product ${stockData.productName}: ${stockData.oldStock} → ${stockData.newStock}`,
    );
  }

  // Get connected clients count for monitoring
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // Get rooms information for debugging
  getRoomsInfo(): Record<string, { clientCount: number; clients: string[] }> {
    const rooms = this.server.sockets.adapter.rooms;
    const roomsInfo: Record<
      string,
      { clientCount: number; clients: string[] }
    > = {};

    rooms.forEach((sockets, roomName) => {
      roomsInfo[roomName] = {
        clientCount: sockets.size,
        clients: Array.from(sockets),
      };
    });

    return roomsInfo;
  }
}
